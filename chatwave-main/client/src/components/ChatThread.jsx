
import { useState, useEffect, useRef } from "react";
import socket from "../socket";

const time = (date) =>
  new Date(date).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

const initial = (name) => (name || "?").charAt(0).toUpperCase();

export default function ChatThread({
  me,
  other,
  messages,
  onSend,
  onBack,
}) {
  const [text, setText] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const bottom = useRef(null);
  const typingTimer = useRef(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages]);

  useEffect(() => {
    const handleMessagesRead = ({ messageIds }) => {
      console.log("Messages marked as read:", messageIds);
    };

    socket.on("chat:messages:read", handleMessagesRead);

    return () => {
      socket.off("chat:messages:read", handleMessagesRead);
    };
  }, []);

  useEffect(() => {
    const handleTyping = ({ from }) => {
      if (from !== other?._id) {
        return;
      }

      setIsTyping(true);

      clearTimeout(typingTimer.current);

      typingTimer.current = setTimeout(() => {
        setIsTyping(false);
      }, 1200);
    };

    socket.on("chat:typing", handleTyping);

    return () => {
      socket.off("chat:typing", handleTyping);
      clearTimeout(typingTimer.current);
    };
  }, [other?._id]);

  const send = () => {
    const cleanText = text.trim();

    if (!cleanText) return;

    onSend(cleanText);
    setText("");
    setIsTyping(false);
  };

  const handleTyping = (e) => {
    const value = e.target.value;

    setText(value);

    if (!value.trim() || !other?._id) {
      return;
    }

    socket.emit("chat:typing", {
      to: other._id,
    });
  };

  return (
    <div className="main">
      <div className="main-head">
        <button
          className="back-btn"
          onClick={onBack}
          aria-label="Back to users"
        >
          ←
        </button>

        <div className="avatar grey">
          {initial(other?.name)}
        </div>

        <div>
          <div className="name">
            {other?.name || "User"}
          </div>

          <div className="user-status">
            {isTyping ? (
              <>
                <span className="online-dot"></span>
                <span>typing...</span>
              </>
            ) : (
              <>
                <span className="online-dot"></span>
                <span>online</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="body">
        {messages.length === 0 && (
          <p className="muted center-text">
            No messages yet.
          </p>
        )}

        {messages.map((message) => {
          const isMine = message.from === me._id;

          return (
            <div
              key={message._id}
              className={
                "bubble " +
                (isMine ? "out" : "in")
              }
            >
              {message.text}

              <span className="stamp">
                {time(message.createdAt)}

                {isMine && (
                  <span
                    style={{
                      marginLeft: "5px",
                      color: message.read
                        ? "#53bdeb"
                        : "#667781",
                      fontWeight: "bold",
                    }}
                    title={
                      message.read
                        ? "Read"
                        : "Sent"
                    }
                  >
                    ✓✓
                  </span>
                )}
              </span>
            </div>
          );
        })}

        <div ref={bottom} />
      </div>

      <div className="foot">
        <input
          type="text"
          value={text}
          placeholder="Type a message"
          onChange={handleTyping}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              send();
            }
          }}
        />

        <button
          className="send"
          onClick={send}
          aria-label="Send message"
        >
          ➤
        </button>
      </div>
    </div>
  );
}

