import User from "../models/UserModel.js";
import nodemailer from 'nodemailer';
import { Op } from "sequelize";
import argon2 from "argon2";
import UserModel from "../models/UserModel.js";
import cloudinary from 'cloudinary';
import { uploadSingleProfileimg } from '../middleware/uploadMiddleware.js';
import multer from "multer";
import crypto from 'crypto';
import { populateHKAE } from "../utils/populateHKAE.js";

export const getUser =  async (req, res) => {
    try {
        const response = await User.findAll(
            {attributes: ["id", "uuid", "name", "email", "username", "gender", "division", "position", "role"]
    });
        res.status(200).json(response);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
            
}

export const getUserById = async (req, res) => {
    try {
      // Fetch the user by UUID from the request parameters
      const user = await User.findOne({
        attributes: ["id", "uuid", "name", "email", "username", "gender", "division", "position", "role"],
        where: {
          id: req.params.id
        }
      });
  
      // Check if the user exists
      if (!user) {
        return res.status(404).json({ msg: 'User not found' });
      }
  
      // Return the user details
      res.status(200).json(user);
    } catch (error) {
      // Handle any errors that occur during the database query
      res.status(500).json({ error: error.message });
    }
  };


export const createUser = async (req, res) => {
    const {name, email, password, confPassword, username, gender, division, position, role} = req.body;
    // Log nilai req.body dan password
    console.log("Request Body:", req.body);
    console.log("Password:", password);
    console.log("ConfPassword:", confPassword);
    // Validasi bahwa password dan confPassword cocok
    if (password !== confPassword) {return res.status(400).json({ msg: "Password dan konfirmasi password tidak cocok" }); }
    // Periksa apakah username sudah ada
     // Check if email already exists
     const existingEmail = await User.findOne({ where: { email } });
     if (existingEmail) {
         return res.status(400).json({ msg: "Email already exists, please choose another" });
     }
 
     // Check if username already exists
     const existingUsername = await User.findOne({ where: { username } });
     if (existingUsername) {
         return res.status(400).json({ msg: "Username already exists, please choose another" });
     }
    const hashPassword = await argon2.hash(password);
       try {
        await User.create({
            name: name,
            email: email,
            password: hashPassword,
            username: username,
            gender: gender,
            division: division,
            position: position,
            role: role
        });
        
        res.status(201).json({msg: "Registration successful"});
       } catch (error) {
            res.status(400).json({ error: error.message });
       }
      

}

export const createUserv2 = async (req, res, next) => {
  const { name, email, password, confPassword, username, gender, division, position, role } = req.body;

  if (password !== confPassword) {
    return res.status(400).json({ msg: "Password dan konfirmasi password tidak cocok" });
  }

  try {
    // Check if email already exists
    const existingEmail = await User.findOne({ where: { email } });
    if (existingEmail) {
      return res.status(400).json({ msg: "Email already exists, please choose another" });
    }

    // Check if username already exists
    const existingUsername = await User.findOne({ where: { username } });
    if (existingUsername) {
      return res.status(400).json({ msg: "Username already exists, please choose another" });
    }

    const hashPassword = await argon2.hash(password);

    req.user = { // Passing user data to the next middleware (uploadProfileImage)
      name: name,
      email: email,
      password: hashPassword,
      username: username,
      gender: gender,
      division: division,
      position: position,
      role: role
    };

    next();
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};


export const uploadProfileImagev2 = async (req, res) => {
  const urlprofile = req.file ? req.file.path : null;

  try {
    await User.create({
      ...req.user, // Spread user data passed from createUserv2
      urlprofile: urlprofile
    });
    await populateHKAE();

    res.status(201).json({ msg: "Registration successful" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Controller function to update user
export const updateUser = async (req, res) => {
  try {
      const userId = req.params.id;
      const user = await User.findOne({
          where: {
              id: userId
          }
      });

      if (!user) return res.status(404).json({ msg: "User not found" });

      const { name, email, password, confPassword, username, gender, division, position, role } = req.body;

      // Log for debugging
      console.log("Request Body:", req.body);
      console.log("Password:", password);
      console.log("ConfPassword:", confPassword);

      // Check if username is new and unique
      if (username && username !== user.username) {
          const existingUser = await User.findOne({ where: { username } });
          if (existingUser) {
              return res.status(400).json({ msg: "Username already exists, please choose another" });
          }
      }

      // Check if email is new and unique
      if (email && email !== user.email) {
          const existingEmail = await User.findOne({ where: { email } });
          if (existingEmail) {
              return res.status(400).json({ msg: "Email already exists, please choose another" });
          }
      }

      // Handle password hashing
      let hashPassword;
      if (password === "" || password === null || password === undefined) {
          hashPassword = user.password;
      } else {
          if (password !== confPassword) {
              return res.status(400).json({ msg: "Password and confirmation do not match" });
          }
          hashPassword = await argon2.hash(password);
      }

      // Handle file upload
      const urlprofile = req.file ? req.file.path : user.urlprofile; // Preserve existing profile photo if none is provided

      // Update user record
      await User.update({
          name: name,
          email: email,
          password: hashPassword,
          username: username,
          gender: gender,
          division: division,
          position: position,
          role: role,
          urlprofile: urlprofile // Update profile photo URL
      }, {
          where: {
              id: user.id
          }
      });

      res.status(200).json({ msg: "User updated successfully" });
  } catch (error) {
      console.error(error); // Log error for debugging
      res.status(400).json({ error: error.message });
  }
};

export const uploadProfileImage = async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ msg: 'No file uploaded' });
      }
  
      const userId = req.userId;
      const newImageUrl = req.file.path;
  
      const user = await UserModel.findOne({
        where: { id: userId }
      });
  
      if (!user) {
        return res.status(404).json({ msg: 'User not found' });
      }
  
      // Delete old profile image
      if (user.urlprofile) {
        const oldImagePublicId = user.urlprofile.split('/').pop().split('.')[0];
        try {
          await cloudinary.uploader.destroy(oldImagePublicId);
        } catch (e) {
          console.warn('Could not delete old cloudinary image:', e.message);
        }
      }
  
      // Update the user's profile image URL in the database
      user.urlprofile = newImageUrl;
      await user.save();
  
      res.status(200).json({ msg: 'Profile image uploaded successfully', url: user.urlprofile });
    } catch (error) {
      res.status(500).json({ msg: error.message });
    }
  };
 
  
  // Middleware to handle file upload errors
  export const handleFileUpload = (req, res, next) => {
    uploadSingleProfileimg(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ msg: 'File size exceeds the 5MB limit' });
        } else if (err) {
          return res.status(400).json({ msg: err.message });
        }
      }
      next();
    });
  };

  export const deleteUserById = async (req, res) => {
    const user = await User.findOne({
        where: {
            id: req.params.id
        }
        
    })
    if (!user) return res.status(404).json({ msg: 'User not found' });

    await User.destroy({
      where: {
        id: req.params.id
      }
    })
    res.status(200).json({ msg: 'User deleted successfully' });
  } 

// Generate a token and save it with an expiration time of 1 minute
const generatePasswordResetToken = async (user) => {
  const token = crypto.randomBytes(20).toString('hex');
  user.resetPasswordToken = token;
  user.resetPasswordExpires = Date.now() + 60000; // 1 minute
  await user.save();
  return token;
};

// Function to clean up expired tokens
const cleanUpExpiredTokens = async () => {
  const now = Date.now();

  await User.update(
    {
      resetPasswordToken: null,
      resetPasswordExpires: null
    },
    {
      where: {
        resetPasswordExpires: { [Op.lt]: now },
        resetPasswordToken: { [Op.ne]: null }
      }
    }
  );
};
// Forgot password function
export const forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
      // Check if the user exists
      const user = await User.findOne({ where: { email } });
      if (!user) {
          return res.status(404).json({ msg: 'User not found' });
      }

      // Clean up expired tokens
      await cleanUpExpiredTokens();

      // Check if the user has an existing token and if it is still valid
      if (user.resetPasswordToken && user.resetPasswordExpires > Date.now()) {
          return res.status(400).json({ msg: 'A password reset token has already been sent and is still valid.' });
      }

      // Generate a new token and set expiration
      const token = await generatePasswordResetToken(user);

      // Send the email with the token
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
      const resetLink = `${clientUrl}/reset-password?token=${token}`;
      const mailOptions = {
          from: process.env.EMAIL_USER,
          to: user.email,
          subject: 'Password Reset',
          html: `
              <div style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
                <h2 style="color: #333;">Password Reset Request</h2>
                <p style="font-size: 16px; color: #555;">
                    You have requested to reset your password. Please use the following token to reset your password:
                </p>
                <p style="font-size: 20px; font-weight: bold; color: #000;">${token}</p>
                <p style="font-size: 16px; color: #555;">
                    Alternatively, you can click the link below to reset your password:
                </p>
                <a href="${resetLink}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: #fff; text-decoration: none; border-radius: 5px;">
                    Reset Password
                </a>
                <p style="font-size: 16px; color: #555;">
                    If you did not request this, please ignore this email.
                </p>
                <p style="font-size: 14px; color: #999;">
                    Regards,<br/>Max Samasta
                </p>
            </div>
          `
      };

      const transporter = nodemailer.createTransport({
          host: process.env.EMAIL_HOST,
          port: process.env.EMAIL_PORT,
          secure: true,
          auth: {
              user: process.env.EMAIL_USER,
              pass: process.env.EMAIL_PASS
          }
      });

      transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
              console.error('Detailed error sending email:', error);
              return res.status(500).json({ msg: 'Error sending email', error: error.message });
          }
          res.status(200).json({ msg: 'Password reset link sent to your email' });
      });

  } catch (error) {
      res.status(500).json({ msg: error.message });
  }
};

// Reset Password function
export const resetPassword = async (req, res) => {
  const { token, newPassword, confirmPassword } = req.body;

  if (newPassword !== confirmPassword) {
      return res.status(400).json({ msg: 'Passwords do not match' });
  }

  try {
      const user = await User.findOne({
          where: {
              resetPasswordToken: token,
              resetPasswordExpires: { [Op.gt]: Date.now() }
          }
      });

      if (!user) {
          return res.status(400).json({ msg: 'Password reset token is invalid or has expired' });
      }

      user.password = await argon2.hash(newPassword);
      user.resetPasswordToken = null;
      user.resetPasswordExpires = null;
      await user.save();

      res.status(200).json({ msg: 'Password has been reset successfully' });
  } catch (error) {
      res.status(500).json({ msg: error.message });
  }
};

// Update Status from 'aktif' to 'suspend' by ID
export const SuspendUser = async (req, res) => {
  const userId = req.params.id;

  try {
      // Find the user by ID
      const user = await UserModel.findOne({
          where: { id: userId }
      });

      if (!user) {
          return res.status(404).json({ message: 'User not found' });
      }

      // Check if the current status is 'aktif'
      if (user.Status === 'aktif') {
          // Update status to 'suspend'
          user.Status = 'suspend';
          await user.save();
          res.status(200).json({ message: 'Status updated to suspend' });
      } else {
          res.status(400).json({ message: 'Status is not "aktif", so cannot be updated to "suspend"' });
      }
  } catch (error) {
      console.error('Error updating user status:', error);
      res.status(500).json({ message: 'Internal Server Error', error });
  }
};

export const AktifUser = async (req, res) => {
  const userId = req.params.id;

  try {
      // Find the user by ID
      const user = await UserModel.findOne({
          where: { id: userId }
      });

      if (!user) {
          return res.status(404).json({ message: 'User not found' });
      }

      // Check if the current status is 'aktif'
      if (user.Status === 'suspend') {
          // Update status to 'suspend'
          user.Status = 'aktif';
          await user.save();
          res.status(200).json({ message: 'Status updated to aktif' });
      } else {
          res.status(400).json({ message: 'Status is not "suspend", so cannot be updated to "aktif"' });
      }
  } catch (error) {
      console.error('Error updating user status:', error);
      res.status(500).json({ message: 'Internal Server Error', error });
  }
};

