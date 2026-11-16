import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api";

export default function Register() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const navigate = useNavigate();

  const change = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const submit = async () => {
    try {
      setError("");
      setSuccess("");

      await api.post("/auth/register", form);

      setSuccess("Account created successfully!");

      setTimeout(() => {
        navigate("/login");
      }, 800);
    } catch (err) {
      setError(
        err.response?.data?.message || "Registration failed"
      );
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">CW</div>

        <h2>Create your ChatWave account</h2>

        <p className="muted">
          Register to start chatting
        </p>

        <label>Name</label>
        <input
          name="name"
          value={form.name}
          onChange={change}
          placeholder="Your name"
        />

        <label>Email</label>
        <input
          name="email"
          value={form.email}
          onChange={change}
          placeholder="you@test.com"
        />

        <label>Password</label>
        <input
          name="password"
          type="password"
          value={form.password}
          onChange={change}
          placeholder="••••••••"
        />

        {error && <div className="error">{error}</div>}

        {success && (
          <div className="success">
            {success}
          </div>
        )}

        <button className="btn" onClick={submit}>
          Create Account
        </button>

        <p className="muted center-text">
          Already have an account?{" "}
          <Link to="/login">Login</Link>
        </p>
      </div>
    </div>
  );
}