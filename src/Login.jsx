import React, { useState } from 'react';
import PropTypes from 'prop-types';
import ForgotPassword from './ForgotPassword';
import SignUp from './SignUp';
import './Login.css';

const VALID_USERNAME = 'admin';
const VALID_PASSWORD = 'admin';

function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [page, setPage] = useState('login');

  if (page === 'forgot') {
    return <ForgotPassword onBack={() => setPage('login')} />;
  }

  if (page === 'signup') {
    return <SignUp onBack={() => setPage('login')} />;
  }

  const handleSubmit = (e) => {
    e.preventDefault();
    if (username === VALID_USERNAME && password === VALID_PASSWORD) {
      setError('');
      onLogin();
    } else {
      setError('Invalid username or password.');
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h2>Verizon Burnsheet</h2>
        <form onSubmit={handleSubmit}>
          <div className="login-field">
            <label>Username</label>
            <input
              type="text"
              placeholder="Enter username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
          </div>
          <div className="login-field">
            <label>Password</label>
            <input
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <div className="login-error">{error}</div>}
          <button className="login-btn" type="submit">Login</button>
        </form>
        <div className="login-links">
          <button className="forgot-password-link" onClick={() => setPage('forgot')}>
            Forgot Password?
          </button>
          <span className="signup-separator">|</span>
          <button className="signup-link" onClick={() => setPage('signup')}>
            Sign Up
          </button>
        </div>
      </div>
    </div>
  );
}

Login.propTypes = {
  onLogin: PropTypes.func.isRequired,
};

export default Login;
