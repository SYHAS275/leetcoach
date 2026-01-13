import React, { useState, useEffect } from 'react';

// Add this line to get the API base URL from environment variables
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '';

interface SignupModalProps {
  open: boolean;
  onClose: () => void;
  onSignupSuccess: () => void;
}

interface CaptchaData {
  captcha_id: string;
  question: string;
}

const SignupModal: React.FC<SignupModalProps> = ({ open, onClose, onSignupSuccess }) => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaData, setCaptchaData] = useState<CaptchaData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Fetch CAPTCHA when modal opens
  useEffect(() => {
    if (open) {
      fetchCaptcha();
    }
  }, [open]);

  const fetchCaptcha = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/captcha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to fetch CAPTCHA');
      setCaptchaData(data);
      setCaptchaAnswer('');
    } catch (err: any) {
      setError('Failed to load CAPTCHA. Please try again.');
    }
  };

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);

    if (!captchaData) {
      setError('CAPTCHA not loaded. Please try again.');
      setLoading(false);
      return;
    }

    if (!captchaAnswer.trim()) {
      setError('Please answer the CAPTCHA question.');
      setLoading(false);
      return;
    }

    try {
      // Use the API_BASE_URL for the register endpoint
      const res = await fetch(`${API_BASE_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          email,
          password,
          captcha_id: captchaData.captcha_id,
          captcha_answer: captchaAnswer.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.detail === 'Invalid CAPTCHA answer') {
          setError('Incorrect CAPTCHA answer. Please try again.');
          setCaptchaAnswer(''); // Clear the answer field
          fetchCaptcha(); // Refresh CAPTCHA
        } else if (data.detail === 'Username or email already registered') {
          setError('Username or email already exists. Please choose different credentials.');
          setCaptchaAnswer(''); // Clear the answer field
          fetchCaptcha(); // Refresh CAPTCHA
        } else {
          throw new Error(data.detail || 'Signup failed');
        }
        return;
      }
      setSuccess(true);
      onSignupSuccess();
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-dark-800 border border-white/10 shadow-2xl rounded-2xl p-8 w-full max-w-md transform transition-all animate-slide-up relative overflow-hidden">
        {/* Decorative background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-2 bg-gradient-to-r from-transparent via-green-500 to-transparent opacity-50 blur-sm"></div>

        <h2 className="text-3xl font-bold mb-6 text-center text-white">Sign Up</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              className="w-full px-4 py-3 rounded-xl bg-dark-900 border border-dark-600 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
              type="text"
              placeholder="Username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
            />
          </div>
          <div>
            <input
              className="w-full px-4 py-3 rounded-xl bg-dark-900 border border-dark-600 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <input
              className="w-full px-4 py-3 rounded-xl bg-dark-900 border border-dark-600 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          {/* CAPTCHA Section */}
          {captchaData && (
            <div className="p-4 bg-dark-900/50 rounded-xl border border-white/5">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-400">Security Check</span>
                <span className="text-xs text-green-400">Required</span>
              </div>
              <div className="text-lg font-mono text-white mb-3 text-center py-2 bg-black/20 rounded border border-white/5">
                {captchaData.question}
              </div>
              <input
                className="w-full px-4 py-2 rounded-lg bg-dark-800 border border-dark-600 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all text-center"
                type="text"
                placeholder="Enter result"
                value={captchaAnswer}
                onChange={e => setCaptchaAnswer(e.target.value)}
                required
              />
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm text-center">
              Signup successful! Redirecting...
            </div>
          )}

          <div className="flex justify-between items-center pt-4">
            <button
              type="button"
              className="px-6 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors text-sm font-medium"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-8 py-2.5 rounded-lg bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white font-semibold shadow-lg shadow-green-500/20 transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </span>
              ) : 'Sign Up'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SignupModal; 