import React, { useState } from 'react';
import './Login.css';

function ForgotPassword({ onBack }) {
  const [email, setEmail] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="auth-icon">🔒</div>
        <h2>Forgot Password</h2>
        <p className="auth-subtitle">
          Enter your email address and we&apos;ll send you a link to reset your password.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="login-field">
            <label>Email Address</label>
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </div>
          <button className="login-btn" type="submit">Send Reset Link</button>
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

export default ForgotPassword;
