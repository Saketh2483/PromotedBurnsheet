import React, { useState } from 'react';
import './Login.css';

function SignUp({ onBack }) {
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
  });

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
  };

  return (
    <div className="login-container">
      <div className="login-card login-card--wide">
        <div className="auth-icon">👤</div>
        <h2>Create Account</h2>
        <p className="auth-subtitle">
          Fill in the details below to create your account.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="login-field">
            <label>Full Name</label>
            <input name="fullName" type="text" placeholder="Enter your full name" value={form.fullName} onChange={handleChange} autoFocus />
          </div>
          <div className="login-field">
            <label>Email Address</label>
            <input name="email" type="email" placeholder="Enter your email" value={form.email} onChange={handleChange} />
          </div>
          <div className="login-field">
            <label>Username</label>
            <input name="username" type="text" placeholder="Choose a username" value={form.username} onChange={handleChange} />
          </div>
          <div className="login-field">
            <label>Password</label>
            <input name="password" type="password" placeholder="Create a password" value={form.password} onChange={handleChange} />
          </div>
          <div className="login-field">
            <label>Confirm Password</label>
            <input name="confirmPassword" type="password" placeholder="Confirm your password" value={form.confirmPassword} onChange={handleChange} />
          </div>
          <button className="login-btn" type="submit">Create Account</button>
        </form>
        <div className="login-links">
          <button className="forgot-password-link" onClick={onBack}>
            ← Back to Login
          </button>
        </div>
      </div>
    </div>
  );
}

export default SignUp;
