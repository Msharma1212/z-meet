import express from 'express';
import { createBroadcast, getBroadcasts, deleteBroadcast } from '../controllers/broadcastController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

router.route('/')
  .get(protect, getBroadcasts)
  .post(protect, createBroadcast);

router.route('/:id')
  .delete(protect, deleteBroadcast);

export default router;
