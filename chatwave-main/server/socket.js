const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const cookie = require("cookie");
const Message = require("./models/Message");

// userId -> number of open sockets for that user
const onlineUsers = new Map();

function getOnlineCount() {
  return onlineUsers.size;
}

function addUser(userId) {
  onlineUsers.set(userId, (onlineUsers.get(userId) || 0) + 1);
}

function removeUser(userId) {
  const count = (onlineUsers.get(userId) || 1) - 1;

  if (count <= 0) {
    onlineUsers.delete(userId);
  } else {
    onlineUsers.set(userId, count);
  }
}

function initSocket(server) {
  const io = new Server(server, {
    cors: {
      origin:
        process.env.CLIENT_URL || "http://localhost:5173",
      credentials: true,
    },
  });

  // JWT check during the handshake
  io.use((socket, next) => {
    try {
      const raw = socket.handshake.headers.cookie || "";
      const token = cookie.parse(raw).token;

      if (!token) {
        return next(new Error("No token"));
      }

      const payload = jwt.verify(
        token,
        process.env.JWT_SECRET
      );

      socket.user = {
        id: payload.id,
      };

      next();
    } catch (err) {
      next(new Error("Not authorised"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.user.id;

    // Each user joins a room named after their own id.
    socket.join(userId);

    addUser(userId);

    console.log(
      "Connected:",
      userId,
      "| online:",
      getOnlineCount()
    );

    // ================= EVENT 1: online:count =================

    io.emit("online:count", getOnlineCount());

    // ================= EVENT 2: chat:history =================

    socket.on("chat:history", async (withUserId, ack) => {
      try {
        const messages = await Message.find({
          $or: [
            {
              from: userId,
              to: withUserId,
            },
            {
              from: withUserId,
              to: userId,
            },
          ],
        }).sort({ createdAt: 1 });

        if (typeof ack === "function") {
          ack(messages);
        }
      } catch (err) {
        console.error("History error:", err);

        if (typeof ack === "function") {
          ack([]);
        }
      }
    });

    // ================= EVENT 3: chat:send =================

    socket.on("chat:send", async ({ to, text }, ack) => {
      try {
        const cleanText = text?.trim();

        if (!to || !cleanText) {
          if (typeof ack === "function") {
            ack({
              ok: false,
              message: "Message cannot be empty",
            });
          }

          return;
        }

        const message = await Message.create({
          from: userId,
          to,
          text: cleanText,
          read: false,
        });

        // Send the saved message to both users.
        io.to(userId).emit("chat:message", message);
        io.to(to).emit("chat:message", message);

        // Count receiver's unread messages from this sender.
        const unreadCount = await Message.countDocuments({
          from: userId,
          to,
          read: false,
        });

        // Update receiver's unread badge.
        io.to(to).emit("chat:unread:update", {
          userId,
          count: unreadCount,
        });

        if (typeof ack === "function") {
          ack({
            ok: true,
            message,
          });
        }
      } catch (err) {
        console.error("Send message error:", err);

        if (typeof ack === "function") {
          ack({
            ok: false,
            message: "Failed to send message",
          });
        }
      }
    });

    // ================= EVENT 4: chat:unread =================

    socket.on("chat:unread", async (ack) => {
      try {
        const unreadMessages = await Message.aggregate([
          {
            $match: {
              to: userId,
              read: false,
            },
          },
          {
            $group: {
              _id: "$from",
              count: {
                $sum: 1,
              },
            },
          },
          {
            $project: {
              _id: 0,
              userId: "$_id",
              count: 1,
            },
          },
        ]);

        if (typeof ack === "function") {
          ack(unreadMessages);
        }
      } catch (err) {
        console.error("Unread count error:", err);

        if (typeof ack === "function") {
          ack([]);
        }
      }
    });

    // ================= EVENT 5: chat:read =================

    socket.on("chat:read", async (fromUserId) => {
      try {
        // Find the unread messages before marking them as read.
        const unreadMessages = await Message.find({
          from: fromUserId,
          to: userId,
          read: false,
        }).select("_id");

        // Mark those messages as read.
        await Message.updateMany(
          {
            from: fromUserId,
            to: userId,
            read: false,
          },
          {
            $set: {
              read: true,
            },
          }
        );

        // Remove the unread badge for the current user.
        io.to(userId).emit("chat:unread:update", {
          userId: fromUserId,
          count: 0,
        });

        // Tell the original sender that their messages were read.
        if (unreadMessages.length > 0) {
          io.to(fromUserId).emit("chat:messages:read", {
            messageIds: unreadMessages.map(
              (message) => message._id.toString()
            ),
          });
        }
      } catch (err) {
        console.error("Read update error:", err);
      }
    });

    // ================= BONUS: chat:typing =================

    socket.on("chat:typing", ({ to }) => {
      if (!to) return;

      io.to(to).emit("chat:typing", {
        from: userId,
      });
    });

    // ================= DISCONNECT =================

    socket.on("disconnect", () => {
      removeUser(userId);

      console.log(
        "Disconnected:",
        userId,
        "| online:",
        getOnlineCount()
      );

      // Tell everyone the new online count.
      io.emit("online:count", getOnlineCount());
    });
  });

  return io;
}

module.exports = initSocket;