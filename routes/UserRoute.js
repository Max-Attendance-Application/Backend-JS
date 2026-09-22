import express from 'express';
import {
    getUser,
    getUserById,
    createUser,
    createUserv2, //fix
    updateUser,
    uploadProfileImage,
    uploadProfileImagev2, //fix
    handleFileUpload,
    deleteUserById,
    forgotPassword,
    resetPassword,
    SuspendUser,
    AktifUser
} from "../controllers/Users.js";
import {verifyUser, adminOnly, } from "../middleware/AuthUser.js";
import { uploadSingleProfileimg } from '../middleware/uploadMiddleware.js';

const router = express.Router();

router.get('/users', verifyUser, adminOnly, getUser);
router.get('/users/:id', verifyUser, adminOnly, getUserById);
router.post('/users', createUser); //no Photo dan TIDAK DI PAKAI RUTENYA!
router.post('/createusersv2', handleFileUpload, createUserv2, uploadProfileImagev2); //withphoto DIPAKAI RUTENYA
router.post('/uploadProfileImage', verifyUser, handleFileUpload, uploadProfileImage); // INI BUAT EMPLOYEE UPDATE FOTONYA
router.patch('/users/:id', verifyUser, handleFileUpload, updateUser);
router.patch('/suspenduser/:id', verifyUser, adminOnly, SuspendUser);
router.patch('/aktifuser/:id', verifyUser, adminOnly, AktifUser);
router.delete('/users/:id', verifyUser, adminOnly, deleteUserById);

router.post('/auth/forgot-password', forgotPassword);
router.post('/auth/reset-password/', resetPassword); // This route requires user to be logged in

export default router;