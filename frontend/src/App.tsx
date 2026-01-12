import React, { useState, useRef, useEffect } from 'react';
import LoginModal from './LoginModal';
import SignupModal from './SignupModal';
import MonacoEditor from '@monaco-editor/react';
import MatrixRain from './MatrixRain';

interface Question {
  id: number;
  title: string;
  description: string;
  examples: { input: string; output: string }[];
  constraints: string[];
}

const steps = [
  'Question',
  'Clarify',
  'Brute Force',
  'Optimize',
  'Code',
  'Review',
];

const languages = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' },
  { value: 'go', label: 'Go' },
];

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '';

function App() {
  const [activeTab, setActiveTab] = useState('Question');
  const [question, setQuestion] = useState<Question | null>(null);
  const [questions, setQuestions] = useState<{ id: number; title: string }[]>([]);
  const [selectedQuestionId, setSelectedQuestionId] = useState<number | null>(null);
  const [clarifyInput, setClarifyInput] = useState('');
  const [clarifyResponse, setClarifyResponse] = useState('');
  const [showClarifyFeedback, setShowClarifyFeedback] = useState(false);
  const [bruteForceInput, setBruteForceInput] = useState('');
  const [bruteForceResponse, setBruteForceResponse] = useState('');
  const [showBruteForceFeedback, setShowBruteForceFeedback] = useState(false);
  const [optimizeInput, setOptimizeInput] = useState('');
  const [optimizeResponse, setOptimizeResponse] = useState('');
  const [showOptimizeFeedback, setShowOptimizeFeedback] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [language, setLanguage] = useState('javascript');
  const [review, setReview] = useState<any>(null);
  const [actualSolution, setActualSolution] = useState<string | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('token'));
  const [codeReviewError, setCodeReviewError] = useState('');
  // Force dark mode logic for this premium theme
  const [darkMode, setDarkMode] = useState(true);
  const [clarifyLoading, setClarifyLoading] = useState(false);
  const [bruteForceLoading, setBruteForceLoading] = useState(false);
  const [optimizeLoading, setOptimizeLoading] = useState(false);
  const [bruteForceTime, setBruteForceTime] = useState('');
  const [bruteForceSpace, setBruteForceSpace] = useState('');
  const [optimizeTime, setOptimizeTime] = useState('');
  const [optimizeSpace, setOptimizeSpace] = useState('');
  const [timer, setTimer] = useState(45 * 60);
  const [timerActive, setTimerActive] = useState(false);
  const [timeout, setTimeoutReached] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [search, setSearch] = useState('');
  const [runOutput, setRunOutput] = useState('');
  const [runLoading, setRunLoading] = useState(false);

  useEffect(() => {
    if (isLoggedIn) {
      fetch(`${API_BASE_URL}/api/questions`)
        .then(res => res.json())
        .then(data => setQuestions(data));
    } else {
      setQuestions([]);
      setQuestion(null);
      setSelectedQuestionId(null);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (selectedQuestionId !== null) {
      console.log('Fetching question for ID:', selectedQuestionId);
      fetch(`${API_BASE_URL}/api/start-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_id: selectedQuestionId })
      })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
          return res.json();
        })
        .then((data) => {
          setQuestion(data.question);
        })
        .catch((error) => console.error('Error fetching question:', error));
    }
  }, [selectedQuestionId]);

  useEffect(() => {
    if (question && language) {
      setCodeInput('// Loading function definition...');
      fetch(`${API_BASE_URL}/api/function-definition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question_id: question.id, language: language })
      })
        .then(res => res.json())
        .then(data => {
          setCodeInput(data.function_definition);
        });
    }
  }, [question, language]);

  useEffect(() => {
    // Always enforce dark mode class
    document.documentElement.classList.add('dark');
  }, []);

  // Timer effect
  useEffect(() => {
    if (!timerActive || timeout) return;
    if (timer <= 0) {
      setTimeoutReached(true);
      setTimerActive(false);
      return;
    }
    timerRef.current = setTimeout(() => setTimer(t => t - 1), 1000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [timer, timerActive, timeout]);

  // Sort questions by id
  const sortedQuestions = [...questions].sort((a, b) => a.id - b.id);
  // Filter by search
  const filteredQuestions = sortedQuestions.filter(q => q.title.toLowerCase().includes(search.toLowerCase()));

  const formatTimer = (t: number) => {
    const m = Math.floor(t / 60).toString().padStart(2, '0');
    const s = (t % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleStartInterview = () => {
    setActiveTab('Clarify');
    setTimerActive(true);
  };

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return token ? { 'Authorization': 'Bearer ' + token } : {};
  };

  const handleGetClarifyFeedback = async () => {
    setClarifyLoading(true);
    setShowClarifyFeedback(false);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    Object.assign(headers, getAuthHeaders());
    const res = await fetch(`${API_BASE_URL}/api/clarify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ user_input: clarifyInput, question_id: selectedQuestionId }),
    });
    const data = await res.json();
    setClarifyResponse(data.response);
    setClarifyLoading(false);
    setShowClarifyFeedback(true);
  };

  const handleGetBruteForceFeedback = async () => {
    setBruteForceLoading(true);
    setShowBruteForceFeedback(false);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    Object.assign(headers, getAuthHeaders());
    const res = await fetch(`${API_BASE_URL}/api/brute-force`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ user_idea: bruteForceInput, time_complexity: bruteForceTime, space_complexity: bruteForceSpace, question_id: selectedQuestionId }),
    });
    const data = await res.json();
    setBruteForceResponse(data.response);
    setBruteForceLoading(false);
    setShowBruteForceFeedback(true);
  };

  const handleGetOptimizeFeedback = async () => {
    setOptimizeLoading(true);
    setShowOptimizeFeedback(false);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    Object.assign(headers, getAuthHeaders());
    const res = await fetch(`${API_BASE_URL}/api/optimize`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ user_idea: optimizeInput, time_complexity: optimizeTime, space_complexity: optimizeSpace, question_id: selectedQuestionId }),
    });
    const data = await res.json();
    setOptimizeResponse(data.response);
    setOptimizeLoading(false);
    setShowOptimizeFeedback(true);
  };

  const handleCodeReview = async () => {
    if (window.confirm('Are you sure you want to submit for final review?')) {
      if (!clarifyInput.trim() && !bruteForceInput.trim() && !codeInput.trim()) {
        setCodeReviewError('Please provide at least one answer before submitting for review.');
        return;
      }
      setCodeReviewError('');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      Object.assign(headers, getAuthHeaders());
      const res = await fetch(`${API_BASE_URL}/api/code-review`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          clarification: clarifyInput,
          brute_force: bruteForceInput,
          code: codeInput,
          language: language,
          brute_force_time_complexity: bruteForceTime,
          brute_force_space_complexity: bruteForceSpace,
          optimize_time_complexity: optimizeTime,
          optimize_space_complexity: optimizeSpace,
          question_id: selectedQuestionId
        }),
      });
      const data = await res.json();
      setReview(data.review);
      setActualSolution(data.actual_solution || null);
      setActiveTab('Review');
      setTimerActive(false);
    }
  };

  const handleLoginSuccess = (token: string) => {
    localStorage.setItem('token', token);
    setIsLoggedIn(true);
    setShowLogin(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsLoggedIn(false);
  };

  const handleRestart = () => {
    setActiveTab('Question');
    setQuestion(null);
    setSelectedQuestionId(null);
    setClarifyInput('');
    setClarifyResponse('');
    setShowClarifyFeedback(false);
    setBruteForceInput('');
    setBruteForceResponse('');
    setShowBruteForceFeedback(false);
    setOptimizeInput('');
    setOptimizeResponse('');
    setShowOptimizeFeedback(false);
    setCodeInput('');
    setReview(null);
    setActualSolution(null);
    setCodeReviewError('');
    setTimer(45 * 60);
    setTimerActive(false);
    setTimeoutReached(false);
  };

  const handleRunCode = async () => {
    setRunLoading(true);
    setRunOutput('');
    try {
      const authHeaders = getAuthHeaders();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authHeaders && typeof authHeaders['Authorization'] === 'string') {
        headers['Authorization'] = authHeaders['Authorization'];
      }
      const res = await fetch(`${API_BASE_URL}/api/run-code`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          code: codeInput,
          language,
          question_id: selectedQuestionId
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to run code');
      setRunOutput(data.output || '');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setRunOutput('Error: ' + errorMsg);
    }
    setRunLoading(false);
  };

  return (
    <div className="min-h-screen bg-dark-900 text-gray-200 font-sans selection:bg-primary-500 selection:text-white overflow-x-hidden">
      {/* Background Ambience */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <MatrixRain />
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent-purple/10 rounded-full blur-[120px]" />
      </div>

      <header className="sticky top-0 z-40 glass border-b border-white/5 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
          <div
            className="flex items-center cursor-pointer group"
            onClick={() => handleRestart()}
          >
            <div className="relative">
              <div className="absolute inset-0 bg-primary-500 blur-md opacity-50 group-hover:opacity-100 transition-opacity rounded-full"></div>
              <img
                src="/logo.png"
                alt="LeetCoach Logo"
                className="relative h-10 w-10 rounded-full object-cover mr-3 border-2 border-primary-500/50"
              />
            </div>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 group-hover:to-white transition-all">
              LeetCoach <span className="text-xs align-top text-primary-400 font-mono opacity-75">BETA</span>
            </h1>
          </div>
          <div className="flex items-center space-x-4">
            {isLoggedIn ? (
              <button
                onClick={handleLogout}
                className="px-4 py-2 rounded-lg text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-400/10 transition-all border border-transparent hover:border-red-400/20"
              >
                Logout
              </button>
            ) : (
              <>
                <button
                  onClick={() => setShowLogin(true)}
                  className="px-5 py-2 rounded-lg text-sm font-medium text-gray-300 hover:text-white hover:bg-white/5 transition-all"
                >
                  Login
                </button>
                <button
                  onClick={() => setShowSignup(true)}
                  className="px-5 py-2 rounded-lg text-sm font-medium bg-primary-600 hover:bg-primary-500 text-white shadow-lg shadow-primary-600/20 hover:shadow-primary-600/40 transition-all transform hover:-translate-y-0.5"
                >
                  Sign Up
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!isLoggedIn ? (
          <div className="flex flex-col items-center justify-center min-h-[80vh] text-center">
            <div className="inline-flex items-center px-4 py-1.5 rounded-full border border-green-500/30 bg-green-500/10 text-green-400 text-xs font-semibold uppercase tracking-wider mb-8 animate-fade-in">
              <span className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse"></span>
              Free for a limited time
            </div>

            <h1 className="text-5xl md:text-7xl font-extrabold mb-8 tracking-tight animate-slide-up leading-tight">
              Master Interviews
              <span className="block mt-4 bg-clip-text text-transparent bg-gradient-to-r from-primary-400 via-accent-purple to-primary-500 animate-glow pb-2">
                The Agentic Way
              </span>
            </h1>

            <p className="max-w-2xl text-lg md:text-xl text-gray-400 mb-10 leading-relaxed animate-slide-up" style={{ animationDelay: '0.1s' }}>
              Experience a realistic, AI-driven coding interview simulation.
              Get real-time feedback, optimize your approach, and level up your skills
              without the paywalls.
            </p>

            <div className="flex flex-col sm:flex-row gap-6 mb-16 animate-slide-up" style={{ animationDelay: '0.2s' }}>
              <button
                onClick={() => setShowSignup(true)}
                className="px-8 py-4 rounded-xl text-lg font-bold bg-white text-dark-900 hover:bg-gray-100 shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:shadow-[0_0_30px_rgba(255,255,255,0.4)] transition-all transform hover:-translate-y-1"
              >
                Start Practicing Free
              </button>
              <button
                onClick={() => setShowLogin(true)}
                className="px-8 py-4 rounded-xl text-lg font-bold glass hover:bg-white/10 text-white border border-white/10 transition-all"
              >
                Log In
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full max-w-6xl animate-slide-up" style={{ animationDelay: '0.3s' }}>
              {[
                { icon: '💬', title: 'Clarify', desc: 'Master the art of requirement gathering with AI roleplay.' },
                { icon: '🧠', title: 'Brute Force', desc: 'Build intuition by starting simple and explaining your thought process.' },
                { icon: '⚡', title: 'Optimize', desc: 'Learn to identify bottlenecks and reduce complexity efficiently.' },
                { icon: '💻', title: 'Code', desc: 'Write clean, production-ready code with line-by-line expert reviews.' }
              ].map((item, i) => (
                <div key={i} className="glass p-6 rounded-2xl glass-hover group text-left">
                  <span className="inline-block p-3 rounded-lg bg-white/5 text-2xl mb-4 group-hover:scale-110 transition-transform">{item.icon}</span>
                  <h3 className="text-xl font-bold text-white mb-2">{item.title}</h3>
                  <p className="text-gray-400 text-sm">{item.desc}</p>
                </div>
              ))}
            </div>

            <footer className="mt-24 pt-8 border-t border-white/5 w-full flex flex-col items-center">
              <div className="flex items-center gap-4 mb-4">
                <img src="/ruthuvikas.jpeg" alt="Founder" className="w-12 h-12 rounded-full border border-white/10" />
                <div className="text-left">
                  <div className="text-white font-medium">Ruthuvikas Ravikumar</div>
                  <div className="text-primary-400 text-sm">Founder</div>
                </div>
              </div>
              <a href="mailto:ruthuvikas.28@gmail.com" className="text-gray-500 hover:text-primary-400 text-sm transition-colors">ruthuvikas.28@gmail.com</a>
            </footer>
          </div>
        ) : question === null ? (
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-white mb-8">Select a Challenge</h2>
            <div className="relative mb-8">
              <input
                type="text"
                placeholder="Search questions..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full px-6 py-4 rounded-xl bg-dark-800 border border-dark-600 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all shadow-lg"
              />
              <svg className="absolute right-6 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {(filteredQuestions || []).map(q => (
                <div
                  key={q.id}
                  onClick={() => setSelectedQuestionId(q.id)}
                  className="glass p-6 rounded-2xl cursor-pointer glass-hover group border-l-4 border-l-transparent hover:border-l-primary-500"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-mono text-gray-500 group-hover:text-primary-400 transition-colors">ID: {q.id}</span>
                    <span className="text-xs px-2 py-1 rounded bg-white/5 text-gray-400">Medium</span>
                  </div>
                  <h3 className="text-lg font-bold text-gray-200 group-hover:text-white transition-colors">{q.title}</h3>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="animate-fade-in">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                <span className="text-primary-400">#</span> {question?.title || 'Loading...'}
              </h2>
              <div className={`font-mono text-xl px-4 py-2 rounded-lg bg-dark-800 border border-white/5 ${timeout ? 'text-red-500 shadow-red-500/20' : 'text-primary-400 shadow-primary-500/20'} shadow-lg`}>
                {formatTimer(timer)}
              </div>
            </div>

            <div className="flex mb-8 overflow-x-auto pb-2 border-b border-white/5 gap-1">
              {(steps || []).map(s => (
                <button
                  key={s}
                  onClick={() => setActiveTab(s)}
                  className={`px-6 py-2 rounded-t-lg text-sm font-medium transition-all relative ${activeTab === s
                    ? 'text-white bg-white/5 border-b-2 border-primary-500'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                >
                  {s}
                  {activeTab === s && <div className="absolute inset-x-0 bottom-0 h-px bg-primary-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]"></div>}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left Panel: Context/Problem */}
              <div className="lg:col-span-1 space-y-6">
                <div className="glass p-6 rounded-2xl">
                  <h3 className="text-lg font-bold text-white mb-4 border-b border-white/5 pb-2">Problem Description</h3>
                  <p className="text-gray-300 leading-relaxed whitespace-pre-wrap text-sm">{question.description}</p>
                </div>

                <div className="glass p-6 rounded-2xl">
                  <h3 className="text-lg font-bold text-white mb-4 border-b border-white/5 pb-2">Examples</h3>
                  <div className="space-y-4">
                    {(question?.examples || []).map((ex, i) => (
                      <div key={i} className="bg-dark-800 p-3 rounded-lg border border-white/5 text-sm">
                        <div className="mb-1"><span className="text-gray-500 font-mono">Input:</span> <span className="text-gray-300 font-mono">{ex.input}</span></div>
                        <div><span className="text-gray-500 font-mono">Output:</span> <span className="text-primary-400 font-mono">{ex.output}</span></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Panel: Workspace */}
              <div className="lg:col-span-2">
                {activeTab === 'Question' && (
                  <div className="glass p-8 rounded-2xl flex flex-col items-center justify-center text-center h-full min-h-[400px]">
                    <div className="w-16 h-16 rounded-full bg-primary-500/10 flex items-center justify-center mb-6">
                      <span className="text-3xl">🚀</span>
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-3">Ready to Start?</h3>
                    <p className="text-gray-400 max-w-md mb-8">The timer will start as soon as you proceed to the Clarification step. Good luck!</p>
                    <button
                      onClick={handleStartInterview}
                      className="px-8 py-3 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-semibold shadow-lg shadow-primary-600/30 transition-all hover:scale-105"
                    >
                      Begin Interview
                    </button>
                  </div>
                )}

                {activeTab === 'Clarify' && (
                  <div className="glass p-6 rounded-2xl h-full flex flex-col">
                    <h3 className="text-xl font-bold text-white mb-4">Clarifying Questions</h3>
                    <div className="flex-grow flex flex-col gap-4">
                      <p className="text-gray-400 text-sm">Ask detailed questions to understand constraints and edge cases.</p>
                      <textarea
                        value={clarifyInput}
                        onChange={(e) => setClarifyInput(e.target.value)}
                        placeholder="e.g. Is the input array always sorted? Can the array be empty?"
                        className="flex-grow w-full p-4 rounded-xl bg-dark-800 border border-dark-600 text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none min-h-[200px]"
                      />
                      <div className="flex justify-end">
                        <button
                          onClick={handleGetClarifyFeedback}
                          disabled={clarifyLoading}
                          className="px-6 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-50 transition-all"
                        >
                          {clarifyLoading ? 'Analyzing...' : 'Ask AI Interviewer'}
                        </button>
                      </div>
                      {showClarifyFeedback && (
                        <div className="mt-4 p-4 rounded-xl bg-dark-800 border-l-4 border-primary-500 animate-slide-up">
                          <h4 className="font-bold text-white mb-2">Interviewer Feedback:</h4>
                          <p className="text-gray-300 whitespace-pre-wrap">{clarifyResponse}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {(activeTab === 'Brute Force' || activeTab === 'Optimize') && (
                  <div className="glass p-6 rounded-2xl h-full flex flex-col">
                    <h3 className="text-xl font-bold text-white mb-4">{activeTab} Approach</h3>
                    <div className="flex-grow flex flex-col gap-4">
                      <p className="text-gray-400 text-sm">
                        {activeTab === 'Brute Force'
                          ? "Describe your initial thought process without worrying about efficiency."
                          : "Refine your approach. How can you improve time/space complexity?"}
                      </p>
                      <textarea
                        value={activeTab === 'Brute Force' ? bruteForceInput : optimizeInput}
                        onChange={(e) => activeTab === 'Brute Force' ? setBruteForceInput(e.target.value) : setOptimizeInput(e.target.value)}
                        placeholder="Explain your approach..."
                        className="flex-grow w-full p-4 rounded-xl bg-dark-800 border border-dark-600 text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none min-h-[200px]"
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <input
                          type="text"
                          value={activeTab === 'Brute Force' ? bruteForceTime : optimizeTime}
                          onChange={(e) => activeTab === 'Brute Force' ? setBruteForceTime(e.target.value) : setOptimizeTime(e.target.value)}
                          placeholder="Time Complexity (e.g., O(n))"
                          className="p-3 rounded-lg bg-dark-800 border border-dark-600 text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                        <input
                          type="text"
                          value={activeTab === 'Brute Force' ? bruteForceSpace : optimizeSpace}
                          onChange={(e) => activeTab === 'Brute Force' ? setBruteForceSpace(e.target.value) : setOptimizeSpace(e.target.value)}
                          placeholder="Space Complexity (e.g., O(1))"
                          className="p-3 rounded-lg bg-dark-800 border border-dark-600 text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div className="flex justify-end mt-2">
                        <button
                          onClick={activeTab === 'Brute Force' ? handleGetBruteForceFeedback : handleGetOptimizeFeedback}
                          disabled={activeTab === 'Brute Force' ? bruteForceLoading : optimizeLoading}
                          className="px-6 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-50 transition-all"
                        >
                          {(activeTab === 'Brute Force' ? bruteForceLoading : optimizeLoading) ? 'Analyzing...' : 'Get Feedback'}
                        </button>
                      </div>
                      {(activeTab === 'Brute Force' ? showBruteForceFeedback : showOptimizeFeedback) && (
                        <div className="mt-4 p-4 rounded-xl bg-dark-800 border-l-4 border-yellow-500 animate-slide-up">
                          <h4 className="font-bold text-white mb-2">Interviewer Feedback:</h4>
                          <p className="text-gray-300 whitespace-pre-wrap">{activeTab === 'Brute Force' ? bruteForceResponse : optimizeResponse}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'Code' && (
                  <div className="flex flex-col gap-4 h-full">
                    <div className="glass p-4 rounded-2xl flex justify-between items-center">
                      <h3 className="font-bold text-white">Editor</h3>
                      <select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        className="p-2 rounded-lg bg-dark-800 border border-dark-600 text-white text-sm focus:outline-none"
                      >
                        {(languages || []).map(lang => (
                          <option key={lang.value} value={lang.value}>{lang.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="rounded-xl overflow-hidden border border-white/10 shadow-2xl">
                      <MonacoEditor
                        height="500px"
                        language={language}
                        theme="vs-dark"
                        value={codeInput}
                        onChange={(value) => setCodeInput(value || '')}
                        options={{
                          minimap: { enabled: false },
                          fontSize: 14,
                          fontFamily: 'Fira Code, monospace',
                          scrollBeyondLastLine: false,
                          smoothScrolling: true,
                          padding: { top: 16 }
                        }}
                      />
                    </div>

                    <div className="glass p-4 rounded-2xl flex flex-col gap-4">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-4">
                          <button
                            onClick={handleRunCode}
                            disabled={runLoading}
                            className="px-6 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white border border-white/5 disabled:opacity-50 transition-all flex items-center gap-2"
                          >
                            {runLoading ? 'Running...' : '▶ Run Code'}
                          </button>
                          <span className="text-xs text-gray-500">Only Python supported currently</span>
                        </div>
                        <button
                          onClick={handleCodeReview}
                          className="px-8 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white font-bold shadow-lg shadow-green-600/20 transition-all hover:scale-105"
                        >
                          Submit Solution
                        </button>
                      </div>

                      {runOutput && (
                        <div className="mt-2 p-4 rounded-xl bg-black border border-white/10 font-mono text-sm text-green-400 overflow-x-auto max-h-40">
                          {runOutput}
                        </div>
                      )}

                      {codeReviewError && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center">
                          {codeReviewError}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'Review' && review && (
                  <div className="glass p-8 rounded-2xl animate-fade-in">
                    <div className="text-center mb-10">
                      <h3 className="text-3xl font-bold text-white mb-2">Interview Performance</h3>
                      <div className="inline-block p-6 rounded-full bg-dark-800 border-4 border-primary-500 mb-4 shadow-[0_0_30px_rgba(99,102,241,0.3)]">
                        <span className="text-5xl font-extrabold text-white">{review?.total ?? '-'}</span>
                        <span className="text-xl text-gray-500 font-bold">/30</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                      {[
                        { title: 'Clarification', score: review?.clarification?.grade, feedback: review?.clarification?.feedback },
                        { title: 'Brute Force', score: review?.brute_force?.grade, feedback: review?.brute_force?.feedback },
                        { title: 'Coding', score: review?.coding?.grade, feedback: review?.coding?.feedback },
                      ].map((metric, i) => (
                        <div key={i} className="bg-dark-800 p-6 rounded-xl border border-white/5 hover:border-primary-500/50 transition-colors">
                          <h4 className="font-bold text-gray-300 mb-2">{metric.title}</h4>
                          <div className="text-3xl font-bold text-white mb-3">{metric.score ?? '-'}<span className="text-sm text-gray-600">/10</span></div>
                          <p className="text-sm text-gray-400 leading-relaxed">{metric.feedback ?? 'No feedback'}</p>
                        </div>
                      ))}
                    </div>

                    {review?.coding?.line_by_line && review.coding.line_by_line.length > 0 && (
                      <div className="mb-8 p-6 bg-dark-800 rounded-xl border border-white/5">
                        <h4 className="font-bold text-lg text-white mb-4">Code Analysis</h4>
                        <div className="space-y-3">
                          {review.coding.line_by_line.map((item: any, i: number) => (
                            <div key={i} className="p-4 rounded-lg bg-red-500/5 border-l-4 border-red-500">
                              <div className="flex justify-between items-start mb-1">
                                <span className="font-mono text-red-400 text-sm">Line {item.line}</span>
                                <span className="text-xs text-red-300/50 uppercase font-bold">Issue</span>
                              </div>
                              <p className="text-red-200 font-medium mb-1">{item.issue}</p>
                              <p className="text-gray-400 text-sm">💡 {item.suggestion}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mb-8 p-6 bg-dark-800 rounded-xl border border-white/5">
                      <h4 className="font-bold text-lg text-white mb-4">Key Takeaways</h4>
                      <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{review?.key_pointers ?? 'No pointers available.'}</p>
                    </div>

                    {actualSolution && (
                      <div className="p-6 bg-black rounded-xl border border-white/10">
                        <h4 className="font-bold text-lg text-white mb-4">Optimal Solution</h4>
                        <pre className="font-mono text-sm text-green-400 overflow-x-auto">
                          {actualSolution}
                        </pre>
                      </div>
                    )}

                    <div className="mt-10 text-center">
                      <button
                        onClick={handleRestart}
                        className="px-10 py-4 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-bold shadow-lg shadow-primary-600/30 transition-all hover:scale-105"
                      >
                        Start New Interview
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      <LoginModal open={showLogin} onClose={() => setShowLogin(false)} onLoginSuccess={handleLoginSuccess} />
      <SignupModal open={showSignup} onClose={() => setShowSignup(false)} onSignupSuccess={() => setShowSignup(false)} />
    </div>
  );
}

export default App;
