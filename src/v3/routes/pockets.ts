import express from 'express';
import { body, header } from 'express-validator';
import { pocketVisitorChecker } from '../middleware/visitor_checker.js';
import {
	deletePocketSession,
	deletePocketUser,
	getPocketAuxiliaryApplications,
	getPocketSessions,
	postPocketReport,
	retrieveUserBackup,
	saveUserBackup,
	submitPocketAuxiliaryApplications,
	validateInvitation,
	validatePocket,
} from '../controllers/pockets_controller.js';

const router = express.Router();

// signup by validating invitation code
router.post('/signup', body('code').isString().notEmpty(), validateInvitation);

// activate middleware at this point
router.use(pocketVisitorChecker());

// validate user for active session
router.get('/validate-me', validatePocket);

// retrieve user backup
router.get('/backup', header('metadata').isString(), retrieveUserBackup);

// send user backup
router.post('/backup', header('metadata').isString(), body('cong_backup').isObject(), saveUserBackup);

// get user sessions
router.get('/sessions', getPocketSessions);

// delete user session
router.delete('/sessions', body('identifier').notEmpty(), deletePocketSession);

// post field service report
router.post('/field-service-reports', body('report').isObject().notEmpty(), postPocketReport);

// get auxiliary pioneer applications
router.get('/applications', getPocketAuxiliaryApplications);

// submit auxiliary pioneer application
router.post('/applications', body('application').isObject().notEmpty(), submitPocketAuxiliaryApplications);

// delete pocket user
router.delete('/erase', deletePocketUser);

export default router;
