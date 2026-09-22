import AdminModel from '../models/AdminModel.js';
import HKAEModel from '../models/HKAEModel.js'; // Import the HKAE model
import UserModel from '../models/UserModel.js'; // Import the
import { updateHKAE } from '../utils/cronJob.js';
import moment from 'moment';
import { Op } from "sequelize";

export const createAdminRecord = async (req, res) => {
    const { Tahun, Bulan, HKA, Jumlah, TanggalHariLibur } = req.body;

    console.log('Request Body:', req.body); // Debug statement

    try {
        // Calculate the number of days remaining in the current month
        const today = moment();
        const daysInMonth = today.daysInMonth();
        const currentDay = today.date();
        const maxHKA = daysInMonth - currentDay; // Maximum allowed HKA value

        // Validate HKA
        if (HKA > maxHKA) {
            return res.status(400).json({ message: `HKA cannot exceed ${maxHKA} days remaining in the current month.` });
        }

        // Ensure TanggalHariLibur is an array and sort it
        const holidays = Array.isArray(TanggalHariLibur) ? TanggalHariLibur.map(Number) : [Number(TanggalHariLibur)];
        holidays.sort((a, b) => a - b); // Sort in ascending order

        // Calculate the number of holidays
        const jumlahLibur = holidays.length;

        // Check for existing record with the same Tahun and Bulan
        const existingRecord = await AdminModel.findOne({
            where: {
                Tahun,
                Bulan
            }
        });

        if (existingRecord) {
            return res.status(400).json({ message: 'Tahun dan Bulan Sudah Ada.' });
        }

        // Create the Admin record with the sorted holidays and the number of holidays
        const newAdminRecord = await AdminModel.create({
            Tahun,
            Bulan,
            HKA,
            Jumlah: jumlahLibur, // Set Jumlah as the count of holidays
            TanggalHariLibur: holidays // Save sorted holidays
        });

        updateHKAE();

        res.status(201).json(newAdminRecord);
    } catch (error) {
        console.error('Error creating Admin record:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

export const getAllAdminRecords = async (req, res) => {
    try {
        // Fetch and sort Admin records by Bulan and Tahun in descending order
        const records = await AdminModel.findAll({
            order: [
                ['Tahun', 'DESC'],
                ['Bulan', 'DESC']
            ]
        });

        res.status(200).json(records);
    } catch (error) {
        console.error('Error fetching Admin records:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// Function to get month name from index
const getMonthName = (index) => {
    const months = [
        'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    return months[index];
};

// Function to get month index from month name
const getMonthIndex = (monthName) => {
    const months = [
        'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    return months.indexOf(monthName);
};

// API Endpoint to get Admin records by date range
export const getAdminRecordsByDateRange = async (req, res) => {
    const from = req.query.from || (req.body && req.body.from);
    const to = req.query.to || (req.body && req.body.to);

    if (!from || !to) {
        return res.status(400).json({ message: 'Both "from" and "to" dates are required.' });
    }

    // Parse the "from" and "to" dates
    const fromDate = moment(from, 'YYYY-MM');
    const toDate = moment(to, 'YYYY-MM');

    if (!fromDate.isValid() || !toDate.isValid()) {
        return res.status(400).json({ message: 'Invalid date format. Use YYYY-MM.' });
    }

    // Extract years and months
    const fromYear = fromDate.year();
    const fromMonthIndex = fromDate.month(); // 0-based index for months

    const toYear = toDate.year();
    const toMonthIndex = toDate.month(); // 0-based index for months

    try {
        // Find Admin records within the year range
        const adminRecords = await AdminModel.findAll({
            where: {
                Tahun: {
                    [Op.between]: [fromYear, toYear]
                }
            },
            order: [['Tahun', 'ASC']]
        });

        // Filter out records to ensure exact match for the month/year range
        const filteredRecords = adminRecords.filter(record => {
            const recordYear = Number(record.Tahun);
            const recordMonthIndex = getMonthIndex(record.Bulan);

            if (recordYear === fromYear && recordYear === toYear) {
                return recordMonthIndex >= fromMonthIndex && recordMonthIndex <= toMonthIndex;
            }
            if (recordYear === fromYear) {
                return recordMonthIndex >= fromMonthIndex;
            }
            if (recordYear === toYear) {
                return recordMonthIndex <= toMonthIndex;
            }
            return recordYear > fromYear && recordYear < toYear;
        });

        // Return the results
        if (filteredRecords.length > 0) {
            res.status(200).json(filteredRecords);
        } else {
            res.status(404).json({ message: 'No records found for the given date range.' });
        }
    } catch (error) {
        console.error('Error fetching Admin records:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};


export const getStatistics = async (req, res) => {
    try {
        // Count total users
        const totalUsers = await UserModel.count();

        // Count active users
        const activeUsers = await UserModel.count({
            where: { Status: 'aktif' }
        });

        // Count suspended users
        const suspendedUsers = await UserModel.count({
            where: { Status: 'suspend' }
        });

        // Get latest Admin record
        const adminRecord = await AdminModel.findOne({
            order: [['Tahun', 'DESC'], ['Bulan', 'DESC']] // Get the most recent record
        });

        // Extract values or set defaults if record not found
        const hka = adminRecord ? adminRecord.HKA : null;
        const hke = adminRecord ? adminRecord.HKE : null;
        const totalHolidays = adminRecord ? adminRecord.Jumlah : 0;

        // Return the statistics
        res.status(200).json({
            'Total Entry': totalUsers,
            'Employee Active': activeUsers,
            'Employee Suspend': suspendedUsers,
            'HKA': hka,
            'HKE': hke,
            'Hari Libur': totalHolidays
        });
    } catch (error) {
        console.error('Error fetching statistics:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};
