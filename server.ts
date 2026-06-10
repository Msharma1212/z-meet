import express from "express";
import path from "path";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";

// Models
import Meeting from "./backend/models/Meeting";
import User from "./backend/models/User";
import Message from "./backend/models/Message";
import Broadcast from "./backend/models/Broadcast";
import GlobalSetting from "./backend/models/GlobalSetting";
import AnalyticsLog from "./backend/models/AnalyticsLog";

// Load env
dotenv.config();

// Routes
import authRoutes from "./backend/routes/authRoutes";
import meetingRoutes from "./backend/routes/meetingRoutes";
import broadcastRoutes from "./backend/routes/broadcastRoutes";
import adminRoutes from "./backend/routes/adminRoutes";

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Database Connection
  const MONGODB_URI = process.env.MONGODB_URI;
  if (MONGODB_URI) {
    mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000, // Fail fast if can't connect
    })
      .then(() => console.log("✅ MongoDB Connected Successfully"))
      .catch((err: any) => {
        console.error("❌ MongoDB Connection Error:", err.message);
        if (err.name === 'MongooseServerSelectionError' || err.message.includes('buffering timed out')) {
          console.error("\x1b[31m%s\x1b[0m", "⚠️ CRITICAL: MongoDB Atlas IP Whitelist Error!");
          console.error("\x1b[33m%s\x1b[0m", "Your environment cannot reach MongoDB. Please:");
          console.error("\x1b[33m%s\x1b[0m", "1. Go to MongoDB Atlas > Network Access");
          console.error("\x1b[33m%s\x1b[0m", "2. Ensure '0.0.0.0/0' is added to the IP Whitelist.");
          console.error("\x1b[33m%s\x1b[0m", "3. Verify your MONGODB_URI in Settings matches your credentials.");
        }
      });
  } else {
    console.warn("MONGODB_URI is not defined. Persistent storage will not work.");
  }

  // API Routes
  app.use("/api/auth", authRoutes);
  app.use("/api/meetings", meetingRoutes);
  app.use("/api/broadcasts", broadcastRoutes);
  app.use("/api/admin", adminRoutes);

  // Auto-cleanup for old meetings (> 7 days) and expired broadcasts
  setInterval(async () => {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const meetingResult = await Meeting.deleteMany({
        createdAt: { $lt: sevenDaysAgo },
        isLive: false // Only delete inactive ones
      });
      const broadcastResult = await Broadcast.deleteMany({
        expiresAt: { $lt: new Date() }
      });
      // Delete join/leave logs older than 2 days
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const logResult = await AnalyticsLog.deleteMany({
        event: { $in: ['meeting_joined', 'meeting_left'] },
        timestamp: { $lt: twoDaysAgo }
      });
      if (meetingResult.deletedCount > 0 || broadcastResult.deletedCount > 0 || logResult.deletedCount > 0) {
        console.log(`Auto-cleanup: Deleted ${meetingResult.deletedCount} old meetings, ${broadcastResult.deletedCount} expired broadcasts, and ${logResult.deletedCount} old meeting join/leave logs.`);
      }
    } catch (err) {
      console.error("Auto-cleanup Error:", err);
    }
  }, 24 * 60 * 60 * 1000); // Run every 24 hours

  // Run immediate startup cleanup for old meeting join/leave logs (> 2 days old)
  setTimeout(async () => {
    try {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const logResult = await AnalyticsLog.deleteMany({
        event: { $in: ['meeting_joined', 'meeting_left'] },
        timestamp: { $lt: twoDaysAgo }
      });
      if (logResult.deletedCount > 0) {
        console.log(`Startup cleanup: Deleted ${logResult.deletedCount} old meeting join/leave logs (> 2 days old) successfully.`);
      }
    } catch (err) {
      console.error("Startup Log Cleanup Error:", err);
    }
  }, 5000);

  // Global settings local cache
  let currentSettings = {
    chatEnabled: true,
    screenShareEnabled: true,
    waitingRoomEnabled: false,
    reactionsEnabled: true,
    mediaEnabled: true
  };

  // Try to load initial global settings from database
  try {
    GlobalSetting.findOne().then(async (settingsDoc) => {
      if (!settingsDoc) {
        await GlobalSetting.create(currentSettings);
      } else {
        currentSettings = {
          chatEnabled: settingsDoc.chatEnabled,
          screenShareEnabled: settingsDoc.screenShareEnabled,
          waitingRoomEnabled: settingsDoc.waitingRoomEnabled,
          reactionsEnabled: settingsDoc.reactionsEnabled,
          mediaEnabled: settingsDoc.mediaEnabled
        };
      }
      app.set('globalSettings', currentSettings);
    }).catch(err => {
      console.error("Mongoose global settings query failed:", err);
    });
  } catch (err) {
    console.error("Failed to load initial settings from database:", err);
  }

  app.set('globalSettings', currentSettings);
  app.set('io', io);

  // Socket.io Logic
  const users: any = {}; // roomID -> Array of user objects { socketId, userId, name }
  const waitingUsers: any = {}; // roomID -> Array of user objects { socketId, userId, name }
  const socketToRoom: any = {}; 
  const socketUserData: any = {}; // socketID -> userData
  const userSockets: any = {}; // userId -> Array of socketIds
  const roomScreenSharers: any = {}; // roomID -> Array of representative userIds

  app.set('userSockets', userSockets);
  app.set('getActiveMeetingsData', () => users);

  function getActiveStats() {
    let totalActiveUsers = 0;
    const roomsList = [];

    for (const roomID in users) {
      if (users[roomID] && users[roomID].length > 0) {
        totalActiveUsers += users[roomID].length;
        roomsList.push({
          roomCode: roomID,
          activeCount: users[roomID].length,
          participants: users[roomID].map((u: any) => ({
            userId: u.userId,
            name: u.name,
            socketId: u.socketId
          }))
        });
      }
    }

    return {
      activeMeetingsCount: roomsList.length,
      totalActiveUsers,
      roomsList,
      onlineUserIds: Object.keys(userSockets)
    };
  }

  io.on("connection", (socket) => {
    console.log("New User Connected:", socket.id);

    // Emit current settings to the newly connected user instantly!
    socket.emit("global-settings-update", app.get('globalSettings') || currentSettings);

    socket.on("register-session", (payload: { userId: string }) => {
      const { userId } = payload;
      if (userId) {
        if (!userSockets[userId]) userSockets[userId] = [];
        if (!userSockets[userId].includes(socket.id)) {
          userSockets[userId].push(socket.id);
        }
        console.log(`Socket session registered: User ${userId} on ${socket.id}`);
        io.to("admin-console").emit("admin-stats-update", getActiveStats());
      }
    });

    socket.on("join-admin-console", () => {
      socket.join("admin-console");
      socket.emit("admin-stats-update", getActiveStats());
    });

    socket.on("join-room", async (payload: { roomID: string, userId: string, name: string }) => {
      const { roomID, userId, name } = payload;
      console.log(`User ${userId} (${name}) joining room ${roomID}`);
      
      socketToRoom[socket.id] = roomID;
      socket.join(roomID);

      let isHost = false;
      let meetingData: any = null;
      let userData: any = null;
      try {
        const meeting = await Meeting.findOne({ code: roomID });
        const userObj = await User.findById(userId);
        if (meeting && userObj) {
          const creatorId = (meeting as any).creatorId || meeting.host;
          if (creatorId && userObj._id) {
            isHost = creatorId.toString() === userObj._id.toString();
          }
          if (userObj.role === 'admin' || userObj.role === 'developer' || userObj.role === 'co-admin') {
            isHost = true;
          }
          meetingData = meeting;
          userData = userObj;
        }
      } catch (err) {}

      console.log("User ID:", userId);
      console.log("Creator ID:", meetingData ? ((meetingData as any).creatorId || meetingData.host) : "None");
      console.log("Meeting Role:", isHost ? "host" : "participant");

      const currentScreenSharers = roomScreenSharers[roomID] || [];
      socket.emit("join-success", {
        meetingRole: isHost ? "host" : "participant",
        meeting: meetingData,
        user: userData,
        screenSharers: currentScreenSharers
      });

      let role = 'user';
      try {
        if (userId && mongoose.Types.ObjectId.isValid(userId)) {
          const dbUser = await User.findById(userId);
          if (dbUser) role = dbUser.role || 'user';
        }
      } catch (err) {}

      const userObj = { socketId: socket.id, userId, name, role };

      if (!users[roomID]) users[roomID] = [];
      
      // Filter out existing entries for same user (to prevent duplicates on reconnect)
      users[roomID] = users[roomID].filter((u: any) => u.userId !== userId);
      users[roomID].push(userObj);

      socketUserData[socket.id] = {
        userId,
        name,
        joinedAt: new Date()
      };

      // Log room join
      try {
        AnalyticsLog.create({
          event: "meeting_joined",
          userId: (userId && mongoose.Types.ObjectId.isValid(userId)) ? new mongoose.Types.ObjectId(userId) : undefined,
          meetingCode: roomID
        }).catch(err => console.error("Logged join-room fail:", err));
      } catch (err) {}

      const usersInThisRoom = users[roomID]
        .filter((u: any) => u.socketId !== socket.id)
        .map((u: any) => u.socketId); // Keep compatibility with existing peer logic

      socket.emit("all-users", usersInThisRoom);
      io.to(roomID).emit("participants-update", users[roomID]);

      // Direct update to admins in console
      io.to("admin-console").emit("admin-stats-update", getActiveStats());
    });

    socket.on("join-waiting-room", async (payload: { roomID: string, userId: string, name: string }) => {
      const { roomID, userId, name } = payload;
      console.log(`User ${userId} waiting for room ${roomID}`);
      
      socketToRoom[socket.id] = roomID;
      socket.join(`${roomID}-waiting`); // Join a separate sub-room for waiting

      const userObj = { socketId: socket.id, userId, name };
      if (!waitingUsers[roomID]) waitingUsers[roomID] = [];
      
      waitingUsers[roomID] = waitingUsers[roomID].filter((u: any) => u.userId !== userId);
      waitingUsers[roomID].push(userObj);

      // Notify host(s) in the main room
      io.to(roomID).emit("waiting-list-update", waitingUsers[roomID]);
    });

    socket.on("admit-user", async (payload: { roomID: string, userId: string, requesterId: string }) => {
      const { roomID, userId, requesterId } = payload;
      
      if (await verifyAuthority(requesterId, roomID)) {
        const userToAdmit = waitingUsers[roomID]?.find((u: any) => u.userId === userId);
        if (userToAdmit) {
          // Notify the specific user they are admitted
          io.to(userToAdmit.socketId).emit("admitted");
          
          // Remove from waiting list
          waitingUsers[roomID] = waitingUsers[roomID].filter((u: any) => u.userId !== userId);
          io.to(roomID).emit("waiting-list-update", waitingUsers[roomID]);

          // Also update DB
          try {
            await Meeting.findOneAndUpdate(
              { code: roomID },
              { $pull: { waitingUsers: userId }, $addToSet: { participants: userId } }
            );
          } catch (err) {
            console.error("Failed to update DB on admit:", err);
          }
        }
      }
    });

    socket.on("reject-user", async (payload: { roomID: string, userId: string, requesterId: string }) => {
      const { roomID, userId, requesterId } = payload;
      
      if (await verifyAuthority(requesterId, roomID)) {
        const userToReject = waitingUsers[roomID]?.find((u: any) => u.userId === userId);
        if (userToReject) {
          io.to(userToReject.socketId).emit("rejected");
          
          waitingUsers[roomID] = waitingUsers[roomID].filter((u: any) => u.userId !== userId);
          io.to(roomID).emit("waiting-list-update", waitingUsers[roomID]);

          try {
            await Meeting.findOneAndUpdate(
              { code: roomID },
              { $pull: { waitingUsers: userId } }
            );
          } catch (err) {
             console.error("Failed to update DB on reject:", err);
          }
        }
      }
    });

    socket.on("sending-signal", (payload) => {
      io.to(payload.userToSignal).emit("user-joined", {
        signal: payload.signal,
        callerID: payload.callerID,
      });
    });

    socket.on("returning-signal", (payload) => {
      io.to(payload.callerID).emit("receiving-returned-signal", {
        signal: payload.signal,
        id: socket.id,
      });
    });

    socket.on("send-message", async (payload) => {
      // Persist message to DB
      let savedMsg = null;
      try {
        const meeting = await Meeting.findOne({ code: payload.roomID });
        if (meeting) {
          savedMsg = await Message.create({
            meetingId: meeting._id,
            sender: payload.userId,
            text: payload.text,
          });
        }
      } catch (err) {
        console.error("Socket: Failed to save message:", err);
      }
      io.to(payload.roomID).emit("receive-message", { ...payload, _id: savedMsg?._id });
    });

    socket.on("broadcast-message", (payload) => {
      io.to(payload.roomID).emit("receive-broadcast", payload);
    });

    socket.on("raise-hand", (payload) => {
      io.to(payload.roomID).emit("user-raised-hand", payload);
    });

    socket.on("emit-reaction", (payload) => {
      io.to(payload.roomID).emit("receive-reaction", payload);
    });

    socket.on("update-message", (payload) => {
      io.to(payload.roomID).emit("message-updated", { _id: payload.messageId, text: payload.text });
    });

    socket.on("delete-message", (payload) => {
      io.to(payload.roomID).emit("message-deleted", payload.messageId);
    });

    socket.on("react-message", (payload) => {
      io.to(payload.roomID).emit("message-reacted", payload.updatedMessage);
    });

    // Helper for role/host verification
    const verifyAuthority = async (requesterId: string, roomID: string) => {
      try {
        const user = await User.findById(requesterId);
        if (user && (user.role === 'admin' || user.role === 'developer' || user.role === 'co-admin')) return true;
        
        const meeting = await Meeting.findOne({ code: roomID });
        if (meeting && (meeting.host.toString() === requesterId)) return true;
        
        return false;
      } catch (err) {
        return false;
      }
    };

    // Global permissions event
    socket.on("update-global-permissions", async (payload) => {
      if (await verifyAuthority(payload.userId, payload.roomID)) {
        io.to(payload.roomID).emit("global-permissions-updated", payload.permissions);
      }
    });

    // Moderation events
    socket.on("mute-participant", async (payload) => {
      if (await verifyAuthority(payload.userId, payload.roomID)) {
        io.to(payload.participantID).emit("force-mute", { roomID: payload.roomID });
      }
    });

    socket.on("disable-camera", async (payload) => {
      if (await verifyAuthority(payload.userId, payload.roomID)) {
        io.to(payload.participantID).emit("force-disable-camera", { roomID: payload.roomID });
      }
    });

    socket.on("remove-participant", async (payload) => {
      if (await verifyAuthority(payload.userId, payload.roomID)) {
        io.to(payload.participantID).emit("force-remove", { roomID: payload.roomID });
      }
    });

    socket.on("block-screen-share", async (payload) => {
      if (await verifyAuthority(payload.userId, payload.roomID)) {
        io.to(payload.roomID).emit("permissions-updated", { blockScreenShare: payload.block });
      }
    });

    socket.on("screen-share-start", (payload: { roomID: string, userId: string }) => {
      const { roomID, userId } = payload;
      if (roomID && userId) {
        if (!roomScreenSharers[roomID]) {
          roomScreenSharers[roomID] = [];
        }
        if (!roomScreenSharers[roomID].includes(userId)) {
          roomScreenSharers[roomID].push(userId);
        }
        io.to(roomID).emit("screen-share-start", { userId, screenSharers: roomScreenSharers[roomID] });
      }
    });

    socket.on("screen-share-stop", (payload: { roomID: string, userId: string }) => {
      const { roomID, userId } = payload;
      if (roomID && userId) {
        if (roomScreenSharers[roomID]) {
          roomScreenSharers[roomID] = roomScreenSharers[roomID].filter((id: string) => id !== userId);
        }
        io.to(roomID).emit("screen-share-stop", { userId, screenSharers: roomScreenSharers[roomID] || [] });
      }
    });

    // Meeting security permission updates
    socket.on("update-permissions", async (payload: { type: string, value: boolean, roomID?: string, roomId?: string, userId?: string }) => {
      const roomID = payload.roomID || payload.roomId;
      const userId = payload.userId;
      if (roomID) {
        if (userId) {
          const authorized = await verifyAuthority(userId, roomID);
          if (!authorized) return;
        }
        io.to(roomID).emit("permissions-updated", { type: payload.type, value: payload.value });
      }
    });

    // Handle sync deletion of meetings
    socket.on("meeting-deleted", ({ meetingId, meetingCode }: { meetingId: string, meetingCode?: string }) => {
      if (meetingId) {
        io.to(meetingId).emit("force-exit", { meetingId });
      }
      if (meetingCode) {
        io.to(meetingCode).emit("force-exit", { meetingId, meetingCode });
      }
    });

    // Real-Time Creator Invite/Request socket handlers
    socket.on("send-creator-request", (payload) => {
      console.log(`[creator-system] Send creator request from ${payload.requesterName} to user ${payload.targetUserId}`);
      io.to(payload.targetSocketId).emit("creator-request", {
        requesterName: payload.requesterName,
        requesterId: payload.requesterId,
        targetUserId: payload.targetUserId,
        roomID: payload.roomID,
        hostSocketId: socket.id
      });
    });

    socket.on("accept-creator-request", async (payload) => {
      try {
        console.log(`[creator-system] User ${payload.targetUserId} accepted creator nomination in room ${payload.roomID}`);
        await User.findByIdAndUpdate(payload.targetUserId, {
          role: 'creator',
          creatorId: payload.hostId
        });
        
        io.to(payload.roomID).emit("creator-accepted", {
          targetUserId: payload.targetUserId,
          hostId: payload.hostId
        });
        
        io.to("admin-console").emit("admin-stats-update", getActiveStats());
      } catch (err) {
        console.error("Error in accept-creator-request:", err);
      }
    });

    socket.on("decline-creator-request", (payload) => {
      console.log(`[creator-system] User ${payload.targetUserName} declined creator nomination`);
      if (payload.hostSocketId) {
        io.to(payload.hostSocketId).emit("creator-declined", {
          targetUserName: payload.targetUserName
        });
      }
    });

    socket.on("disconnect", () => {
      console.log("User Disconnected:", socket.id);
      const roomID = socketToRoom[socket.id];
      
      // Track duration and register left event list log
      const userData = socketUserData[socket.id];

      // Clean up screenshare if disconnecting user was sharing
      if (userData && userData.userId && roomID && roomScreenSharers[roomID]) {
        const userId = userData.userId;
        if (roomScreenSharers[roomID].includes(userId)) {
          roomScreenSharers[roomID] = roomScreenSharers[roomID].filter((id: string) => id !== userId);
          io.to(roomID).emit("screen-share-stop", { userId, screenSharers: roomScreenSharers[roomID] });
        }
      }

      if (userData) {
        const durationSeconds = Math.round((Date.now() - userData.joinedAt.getTime()) / 1000);
        try {
          AnalyticsLog.create({
            event: "meeting_left",
            userId: (userData.userId && mongoose.Types.ObjectId.isValid(userData.userId)) ? new mongoose.Types.ObjectId(userData.userId) : undefined,
            meetingCode: roomID,
            duration: durationSeconds
          }).catch(err => console.error("Logged meeting_left fail:", err));
        } catch (err) {}
        delete socketUserData[socket.id];
      }

      if (users[roomID]) {
        users[roomID] = users[roomID].filter((u: any) => u.socketId !== socket.id);
        io.to(roomID).emit("participants-update", users[roomID]);
        if (users[roomID].length === 0) {
          Meeting.findOneAndUpdate({ code: roomID }, { isLive: false }).exec().catch(err => {
            console.error("Error setting isLive: false for ended meeting:", err);
          });
        }
      }
      
      if (waitingUsers[roomID]) {
        waitingUsers[roomID] = waitingUsers[roomID].filter((u: any) => u.socketId !== socket.id);
        io.to(roomID).emit("waiting-list-update", waitingUsers[roomID]);
      }

      socket.broadcast.emit("user-left", socket.id);
      delete socketToRoom[socket.id];

      // Clean up userSockets map
      for (const uid in userSockets) {
        if (userSockets[uid]) {
          userSockets[uid] = userSockets[uid].filter((sid: string) => sid !== socket.id);
          if (userSockets[uid].length === 0) {
            delete userSockets[uid];
          }
        }
      }

      // Direct update to admins in console
      io.to("admin-console").emit("admin-stats-update", getActiveStats());
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
