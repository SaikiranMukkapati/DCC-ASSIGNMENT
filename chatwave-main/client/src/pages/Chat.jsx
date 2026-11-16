import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../api";
import socket from "../socket";

import UserList from "../components/UserList.jsx";
import ChatThread from "../components/ChatThread.jsx";

export default function Chat({ user, onLogout }) {
  const [users, setUsers] = useState([]);
  const [activeUser, setActiveUser] = useState(null);
  const [onlineCount, setOnlineCount] = useState(0);
  const [unread, setUnread] = useState({});
  const [messages, setMessages] = useState([]);

  const navigate = useNavigate();

  useEffect(() => {
    api
      .get("/chat/users")
      .then((res) => {
        setUsers(res.data);
      })
      .catch((err) => {
        console.error("Failed to load users:", err);
      });
  }, []);


  useEffect(() => {
    if (!socket.connected) {
      socket.connect();
    }
  }, []);

  useEffect(() => {
    const handleOnlineCount = (count) => {
      setOnlineCount(count);
    };

    const handleMessage = (message) => {
      const currentUserId = user?._id;
      const selectedUserId = activeUser?._id;

      const belongsToActiveChat =
        selectedUserId &&
        ((message.from === currentUserId &&
          message.to === selectedUserId) ||
          (message.from === selectedUserId &&
            message.to === currentUserId));

      if (belongsToActiveChat) {
        setMessages((previousMessages) => {
          const alreadyExists = previousMessages.some(
            (item) => item._id === message._id
          );

          if (alreadyExists) {
            return previousMessages;
          }

          return [...previousMessages, message];
        });

        // If the message came from the other user while
        // the conversation is open, mark it as read.
        if (
          message.from === selectedUserId &&
          message.to === currentUserId
        ) {
          socket.emit("chat:read", selectedUserId);

          setUnread((previousUnread) => ({
            ...previousUnread,
            [selectedUserId]: 0,
          }));
        }

        return;
      }

      // Message belongs to another conversation.
      if (
        message.to === currentUserId &&
        message.from !== currentUserId
      ) {
        setUnread((previousUnread) => ({
          ...previousUnread,
          [message.from]:
            (previousUnread[message.from] || 0) + 1,
        }));
      }
    };

    const handleUnreadUpdate = ({ userId, count }) => {
      console.log(
        "UNREAD UPDATE RECEIVED:",
        userId,
        count
      );

      setUnread((previousUnread) => ({
        ...previousUnread,
        [userId]: count,
      }));
    };

    const handleMessagesRead = ({ messageIds }) => {
      console.log(
        "MESSAGES READ:",
        messageIds
      );

      setMessages((previousMessages) =>
        previousMessages.map((message) =>
          messageIds.includes(message._id)
            ? {
                ...message,
                read: true,
              }
            : message
        )
      );
    };

    socket.on("online:count", handleOnlineCount);
    socket.on("chat:message", handleMessage);
    socket.on(
      "chat:unread:update",
      handleUnreadUpdate
    );
    socket.on(
      "chat:messages:read",
      handleMessagesRead
    );

    return () => {
      socket.off(
        "online:count",
        handleOnlineCount
      );

      socket.off(
        "chat:message",
        handleMessage
      );

      socket.off(
        "chat:unread:update",
        handleUnreadUpdate
      );

      socket.off(
        "chat:messages:read",
        handleMessagesRead
      );
    };
  }, [activeUser, user]);

  useEffect(() => {
    const loadUnreadCounts = () => {
      socket.emit("chat:unread", (items) => {
        const unreadCounts = {};

        items.forEach((item) => {
          unreadCounts[item.userId] = item.count;
        });

        setUnread(unreadCounts);
      });
    };

    if (socket.connected) {
      loadUnreadCounts();
    } else {
      socket.once("connect", loadUnreadCounts);
    }

    return () => {
      socket.off("connect", loadUnreadCounts);
    };
  }, []);

  const openChat = (other) => {
    setActiveUser(other);
    setMessages([]);

    socket.emit(
      "chat:history",
      other._id,
      (history) => {
        setMessages(history);
      }
    );

    socket.emit("chat:read", other._id);

    // Remove unread badge.
    setUnread((previousUnread) => ({
      ...previousUnread,
      [other._id]: 0,
    }));
  };

  const sendMessage = (text) => {
    if (!text.trim() || !activeUser) {
      return;
    }

    socket.emit("chat:send", {
      to: activeUser._id,
      text: text.trim(),
    });
  };

  const closeChat = () => {
    setActiveUser(null);
    setMessages([]);

    socket.emit("chat:unread", (items) => {
      const unreadCounts = {};

      items.forEach((item) => {
        unreadCounts[item.userId] = item.count;
      });

      setUnread(unreadCounts);
    });
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (err) {
      console.error("Logout error:", err);
    }

    socket.disconnect();
    onLogout();
    navigate("/login");
  };


  return (
    <div className="app">
      <UserList
        me={user}
        users={users}
        activeUser={activeUser}
        unread={unread}
        onlineCount={onlineCount}
        onSelect={openChat}
        onLogout={logout}
      />

      {activeUser ? (
        <ChatThread
          me={user}
          other={activeUser}
          messages={messages}
          onSend={sendMessage}
          onBack={closeChat}
        />
      ) : (
        <div className="main">
          <div className="empty">
            <div className="empty-icon">
              💬
            </div>

            <h3>Welcome to ChatWave</h3>

            <p>
              Select a user from the left to start
              chatting.
            </p>

            <span className="online-pill">
              Online users: {onlineCount}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}