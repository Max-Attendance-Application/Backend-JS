import moment from 'moment-timezone';
import HKAEModel from '../models/HKAEModel.js';
import AbsenModel from "../models/AbsenModel.js";
import UserModel from "../models/UserModel.js";
import { Op } from "sequelize";
import { calculateDistance } from '../utils/location.js';

export const getaAbsen = async (req, res) => {
    try {
        let response;{
            response = await AbsenModel.findAll({
                include: [{
            model: UserModel,
            attributes: { exclude: ['password'] } // Exclude the password field
        }]
            });
        }
        res.status(200).json(response);
    } catch (error) {
        res.status(500).json({msg: error.message});
    }
}

export const getAbsenbyId = async (req, res) => {
    try {
        const absenId = parseInt(req.params.id, 10); // Retrieve and parse the ID from the request parameters

        if (isNaN(absenId)) {
            return res.status(400).json({
                message: 'Invalid ID format'
            });
        }

        const absen = await AbsenModel.findOne({
            where: {
                id: absenId
            },
            include: [{
                model: UserModel,
                attributes: { exclude: ['password'] } // Exclude the password field
            }]
        });

        if (!absen) {
            return res.status(404).json({
                message: 'Absen record not found'
            });
        }

        res.status(200).json(absen);
    } catch (error) {
        res.status(500).json({
            message: 'Error fetching absen record',
            error: error.message
        });
    }
};

export const getAbsenByName = async (req, res) => {
    try {
        const { name } = req.params; // Retrieve the user name from request parameters

        if (!name) {
            return res.status(400).json({
                message: 'User name is required'
            });
        }

        // Find the user by name
        const user = await UserModel.findOne({
            where: {
                name: name
            }
        });

        if (!user) {
            return res.status(404).json({
                message: 'User not found'
            });
        }

        // Find the absen records for the found user
        const absens = await AbsenModel.findAll({
            where: {
                userId: user.id
            },
            include: [{
                model: UserModel,
                attributes: { exclude: ['password'] } // Exclude the password field
            }]
        });

        if (absens.length === 0) {
            return res.status(404).json({
                message: 'No absen records found for this user'
            });
        }

        res.status(200).json(absens);
    } catch (error) {
        res.status(500).json({
            message: 'Error fetching absen records',
            error: error.message
        });
    }
};

export const getAbsens = async (req, res) => {
    try {
        const { fullname, id, from, to } = req.query;
        const whereClause = {};
        const userWhereClause = {};

        // If fullname is provided, add it to the user where clause
        if (fullname) {
            userWhereClause.name = fullname;
        }

        // If id is provided, add it to the user where clause
        if (id) {
            userWhereClause.id = parseInt(id, 10);
        }

        // If from and to dates are provided, add them to the where clause
        if (from && to) {
            const fromDate = moment(from).startOf('day').toDate();
            const toDate = moment(to).endOf('day').toDate();
            whereClause.tapin = {
                [Op.between]: [fromDate, toDate]
            };
        } else if (from) {
            const fromDate = moment(from).startOf('day').toDate();
            whereClause.tapin = {
                [Op.gte]: fromDate
            };
        } else if (to) {
            const toDate = moment(to).endOf('day').toDate();
            whereClause.tapin = {
                [Op.lte]: toDate
            };
        }

        let absens;

        if (fullname || id) {
            const user = await UserModel.findOne({
                where: userWhereClause
            });

            if (!user) {
                return res.status(404).json({
                    message: 'User not found'
                });
            }

            whereClause.userId = user.id;
            absens = await AbsenModel.findAll({
                where: whereClause,
                include: [{
                    model: UserModel,
                    attributes: { exclude: ['password'] }
                }]
            });
        } else {
            absens = await AbsenModel.findAll({
                where: whereClause,
                include: [{
                    model: UserModel,
                    attributes: { exclude: ['password'] }
                }]
            });
        }

        if (absens.length === 0) {
            return res.status(404).json({
                message: 'No absen records found'
            });
        }

        res.status(200).json(absens);
    } catch (error) {
        res.status(500).json({
            message: 'Error fetching absen records',
            error: error.message
        });
    }
};


const VALID_LOCATION = {
    latitude: -6.577023245193599, // Example latitude
    longitude: 106.81070304025452, // Example longitude
    radius: 9 // Radius in meters
};

// Define a function to check if the location is within the allowed radius
const isWithinLocation = (latitude, longitude) => {
    const distance = calculateDistance(
        VALID_LOCATION.latitude,
        VALID_LOCATION.longitude,
        latitude,
        longitude
    );
    return distance <= VALID_LOCATION.radius;
};

export const createAbsenTapin = async (req, res) => {
    const photo = req.file; // Using multer for file upload
    const tapin = moment().tz('Asia/Jakarta').format(); // Current time for tap in
    const { latitude, longitude } = req.body; // Get location from request body

    if (!photo) {
        return res.status(400).json({ message: "Photo is required" });
    }

    if (latitude === undefined || longitude === undefined) {
        return res.status(400).json({ message: "Location data is required" });
    }

    if (!isWithinLocation(parseFloat(latitude), parseFloat(longitude))) {
        return res.status(400).json({ message: "Your location is outside the allowed area for attendance" });
    }

    try {
        const user = await UserModel.findByPk(req.userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const startOfDay = moment().startOf('day').toDate();
        const endOfDay = moment().endOf('day').toDate();

        const existingAbsen = await AbsenModel.findOne({
            where: {
                userId: req.userId,
                tapin: {
                    [Op.between]: [startOfDay, endOfDay]
                }
            }
        });

        if (existingAbsen) {
            return res.status(400).json({ message: "You can only tap in once per day" });
        }

        const hkaeRecord = await HKAEModel.findOne({ where: { userId: req.userId } });

        if (!hkaeRecord) {
            return res.status(404).json({ message: "HKAE record not found for user" });
        }

        const lastTapin = await AbsenModel.findOne({
            where: { userId: req.userId },
            order: [['tapin', 'DESC']]
        });

        const hkeIncrement = lastTapin && moment(tapin).diff(lastTapin.tapin, 'hours') >= 24 ? hkaeRecord.HKE + 1 : hkaeRecord.HKE;

        await HKAEModel.update(
            { HKE: hkeIncrement },
            { where: { userId: req.userId } }
        );

        const newAbsen = await AbsenModel.create({
            userId: req.userId,
            photo: photo.path,
            tapin,
            tapout: null,
            latitudeTapIn: latitude,
            longitudeTapIn: longitude
        });

        const formattedAbsen = {
            id: newAbsen.id,
            userId: newAbsen.userId,
            photo: newAbsen.photo,
            tapin: moment(newAbsen.tapin).tz('Asia/Jakarta').format(),
            tapout: newAbsen.tapout ? moment(newAbsen.tapout).tz('Asia/Jakarta').format() : null,
            latitude: latitude,
            longitude: longitude,
            createdAt: moment(newAbsen.createdAt).tz('Asia/Jakarta').format(),
            updatedAt: moment(newAbsen.updatedAt).tz('Asia/Jakarta').format()
        };

        res.status(201).json({ message: "Tap in successful", data: formattedAbsen });
    } catch (error) {
        res.status(500).json({ message: "Error creating tap in record", error: error.message });
    }
};
  
export const createAbsenTapout = async (req, res) => {
    const tapout = moment().tz('Asia/Jakarta').format(); // Current time for tap out
    const { latitude, longitude } = req.body; // Get location from request body

    // Check if location is provided and validate it
    if (latitude === undefined || longitude === undefined) {
        return res.status(400).json({ message: "Location data is required" });
    }

    if (!isWithinLocation(parseFloat(latitude), parseFloat(longitude))) {
        return res.status(400).json({ message: "Your location is outside the allowed area for attendance" });
    }

    // Check if the user has already tapped out today
    const startOfDay = moment().startOf('day').toDate();
    const endOfDay = moment().endOf('day').toDate();

    const existingAbsen = await AbsenModel.findOne({
        where: {
            userId: req.userId,
            tapout: {
                [Op.between]: [startOfDay, endOfDay]
            }
        }
    });

    if (existingAbsen) {
        return res.status(400).json({ message: "You can only tap out once per day" });
    }
    
    try {
        // Find the tap-in record that has not been tapped out
        const absen = await AbsenModel.findOne({
            where: {
                userId: req.userId,
                tapout: null, // Find records where tap out is not set
                tapin: {
                    [Op.between]: [startOfDay, endOfDay] // Ensure the tap-in is on the same day
                }
            }
        });

        if (!absen) {
            return res.status(404).json({ message: "Tap in record not found or already tapped out" });
        }

        // Update the tap out record
        absen.tapout = tapout;
        absen.latitudeTapOut = latitude;
        absen.longitudeTapOut = longitude;
        await absen.save();

        // Format tapin and tapout before sending response
        const formattedAbsen = {
            id: absen.id,
            userId: absen.userId,
            tapin: moment(absen.tapin).tz('Asia/Jakarta').format(), // Format tapin in Jakarta timezone
            tapout: moment(absen.tapout).tz('Asia/Jakarta').format(), // Format tapout in Jakarta timezone
            latitude: absen.latitudeTapOut,
            longitude: absen.longitudeTapOut,
            createdAt: moment(absen.createdAt).tz('Asia/Jakarta').format(), // Format createdAt in Jakarta timezone
            updatedAt: moment(absen.updatedAt).tz('Asia/Jakarta').format() // Format updatedAt in Jakarta timezone
        };

        res.status(201).json({ message: "Tap Out successful", data: formattedAbsen });
    } catch (error) {
        res.status(500).json({ message: "Error creating tap out record", error: error.message });
    }
};

export const updateAbsen = async (req, res) => {
    try {
        const absenId = parseInt(req.params.id, 10);
        if (isNaN(absenId)) {
            return res.status(400).json({ message: 'Invalid ID format' });
        }

        const absen = await AbsenModel.findByPk(absenId);
        if (!absen) {
            return res.status(404).json({ message: 'Absen record not found' });
        }

        if (req.role !== 'admin' && absen.userId !== req.userId) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const { tapin, tapout, latitudeTapIn, longitudeTapIn, latitudeTapOut, longitudeTapOut } = req.body;
        if (tapin) absen.tapin = tapin;
        if (tapout) absen.tapout = tapout;
        if (latitudeTapIn !== undefined) absen.latitudeTapIn = latitudeTapIn;
        if (longitudeTapIn !== undefined) absen.longitudeTapIn = longitudeTapIn;
        if (latitudeTapOut !== undefined) absen.latitudeTapOut = latitudeTapOut;
        if (longitudeTapOut !== undefined) absen.longitudeTapOut = longitudeTapOut;
        if (req.file) absen.photo = req.file.path;

        await absen.save();

        res.status(200).json({ message: 'Absen record updated successfully', data: absen });
    } catch (error) {
        res.status(500).json({ message: 'Error updating absen record', error: error.message });
    }
};

export const deleteAbsen = async (req, res) => {
    try {
        const absenId = parseInt(req.params.id, 10);
        if (isNaN(absenId)) {
            return res.status(400).json({ message: 'Invalid ID format' });
        }

        const absen = await AbsenModel.findByPk(absenId);
        if (!absen) {
            return res.status(404).json({ message: 'Absen record not found' });
        }

        if (req.role !== 'admin') {
            return res.status(403).json({ message: 'Access denied: admin only' });
        }

        await absen.destroy();

        res.status(200).json({ message: 'Absen record deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting absen record', error: error.message });
    }
};

