'use client';
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { 
  Repository, 
  MetricsData, 
  TimeSeriesDataPoint, 
  TestResult, 
  RepositoryTestsResponse, 
  DashboardWidget, 
  DashboardConfig, 
  WebSocketMessage 
} from '@/types/dashboardTypes';
import { API_BASE_URL, WS_URL, RECONNECT_DELAY } from '@/constants/routes';
import Sidebar from '@/components/Sidebar';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);
const Dashboard: React.FC = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'metrics' | 'repositories' | 'tests' | 'settings'>('metrics');
  const [metricsData, setMetricsData] = useState<MetricsData | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesDataPoint[]>([]);
  const [selectedRepository, setSelectedRepository] = useState<string | null>(null);
  const [repositoryTests, setRepositoryTests] = useState<TestResult[]>([]);
  const [testStatusCounts, setTestStatusCounts] = useState<{[key: string]: number}>({});
  const [dashboardConfig, setDashboardConfig] = useState<DashboardConfig | null>(null);
  const [timePeriod, setTimePeriod] = useState<'24h' | '7d' | '30d' | '90d'>('7d');
  const [loading, setLoading] = useState<boolean>(true);
  const [sectionLoading, setSectionLoading] = useState<{[key: string]: boolean}>({
    metrics: false,
    repositories: false,
    tests: false,
    dashboard: false
  });
  const [error, setError] = useState<string | null>(null);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [testSortField, setTestSortField] = useState<string>('executedAt');
  const [testSortOrder, setTestSortOrder] = useState<'asc' | 'desc'>('desc');
  const [testStatusFilter, setTestStatusFilter] = useState<string | null>(null);
  const [testLimit, setTestLimit] = useState<number>(20);
  const [showNewRepositoryForm, setShowNewRepositoryForm] = useState<boolean>(false);
  const [newRepository, setNewRepository] = useState<Partial<Repository>>({
    name: '',
    url: '',
    owner: '',
    description: '',
    status: 'active'
  });
  const [editRepository, setEditRepository] = useState<Repository | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef<number>(0);
  const maxReconnectDelay = 30000; 
  const heartbeatIntervalRef = useRef<number | null>(null);
  const toggleSidebar = (): void => {
    setSidebarCollapsed(prev => !prev);
  };

  const handleTabChange = (tab: 'metrics' | 'repositories' | 'tests' | 'settings'): void => {
    setActiveTab(tab);
    switch (tab) {
      case 'repositories':
        fetchRepositories();
        break;
      case 'tests':
        if (selectedRepository) {
          fetchRepositoryTests(selectedRepository);
        }
        break;
      case 'settings':
        fetchDashboardConfig();
        break;
      default:
        break;
    }
  };

  const connectWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    
    setWsStatus('connecting');
    const ws = new WebSocket(WS_URL);
    
    ws.onopen = () => {
      console.log('WebSocket connected');
      setWsStatus('connected');
      reconnectAttempts.current = 0;
      heartbeatIntervalRef.current = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);
      ws.send(JSON.stringify({
        type: 'subscribe',
        channel: 'metrics'
      }));
    };
    
    ws.onmessage = (event: MessageEvent) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        
        switch (message.type) {
          case 'metrics':
            setMetricsData(prevData => ({
              ...prevData,
              ...message.data
            }));
            break;
          case 'testResult':

            fetchTimeSeriesData(timePeriod, selectedRepository);
       
            if (activeTab === 'tests' && selectedRepository) {
              fetchRepositoryTests(selectedRepository);
            }
            break;
          case 'repositoryUpdate':
            fetchRepositories();
            break;
          default:
            console.warn(`Unknown message type: ${message.type}`);
        }
      } catch (err) {
        console.error('Error parsing WebSocket message:', err);
      }
    };
    
    ws.onerror = (event: Event) => {
      console.error('WebSocket error:', event);
      setError("WebSocket connection error. Some data may not update in real-time.");
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    };
    
    ws.onclose = (event: CloseEvent) => {
      console.log(`WebSocket disconnected: ${event.code} ${event.reason}`);
      setWsStatus('disconnected');
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }

      const delay = Math.min(
        RECONNECT_DELAY * Math.pow(1.5, reconnectAttempts.current),
        maxReconnectDelay
      );
      reconnectAttempts.current++;
      
      console.log(`Trying to reconnect in ${delay}ms...`);
      setTimeout(connectWebSocket, delay);
    };
    
    wsRef.current = ws;
  }, [activeTab, selectedRepository, timePeriod]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close(1000, "Component unmounted");
      }
    };
  }, [connectWebSocket]);
  const fetchMetricsSummary = async (): Promise<void> => {
    setSectionLoading(prev => ({ ...prev, metrics: true }));
    try {
      const response = await fetch(`${API_BASE_URL}/api/metrics/summary`);
      if (!response.ok) throw new Error(`Failed to fetch metrics summary: ${response.status}`);
      const data = await response.json();
      setMetricsData(data.data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error("Error fetching metrics summary:", errorMessage);
      setError("Failed to fetch metrics summary. Please try again later.");
    } finally {
      setSectionLoading(prev => ({ ...prev, metrics: false }));
    }
  };

  const fetchRepositories = async (): Promise<void> => {
    setSectionLoading(prev => ({ ...prev, repositories: true }));
    try {
      const response = await fetch(`${API_BASE_URL}/api/repositories`);
      if (!response.ok) throw new Error(`Failed to fetch repositories: ${response.status}`);
      const data = await response.json();
      setRepositories(data.data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error("Error fetching repositories:", errorMessage);
      setError("Failed to fetch repositories. Please try again later.");
    } finally {
      setSectionLoading(prev => ({ ...prev, repositories: false }));
    }
  };
  const fetchTimeSeriesData = async (period: string = '7d', repositoryId: string | null = null): Promise<void> => {
    try {
      let url = `${API_BASE_URL}/api/metrics/time-series?period=${period}`;
      if (repositoryId) {
        url += `&repositoryId=${repositoryId}`;
      }
      
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch time series data: ${response.status}`);
      const data = await response.json();
      setTimeSeriesData(data.data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error("Error fetching time series data:", errorMessage);
      setError("Failed to fetch time series data. Please try again later.");
    }
  };

  const fetchRepositoryTests = async (repositoryId: string): Promise<void> => {
    setSectionLoading(prev => ({ ...prev, tests: true }));
    try {
      let url = `${API_BASE_URL}/api/metrics/repositories/${repositoryId}/tests?`;

      const params = new URLSearchParams();
      params.append('limit', testLimit.toString());
      params.append('sort', testSortField);
      params.append('order', testSortOrder);
      if (testStatusFilter) {
        params.append('status', testStatusFilter);
      }
      
      const response = await fetch(`${url}${params.toString()}`);
      if (!response.ok) throw new Error(`Failed to fetch repository tests: ${response.status}`);
      const data = await response.json() as RepositoryTestsResponse;
      setRepositoryTests(data.data);
      setTestStatusCounts(data.statusCounts);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error("Error fetching repository tests:", errorMessage);
      setError("Failed to fetch repository tests. Please try again later.");
    } finally {
      setSectionLoading(prev => ({ ...prev, tests: false }));
    }
  };
  const fetchDashboardConfig = async (userId?: string): Promise<void> => {
    setSectionLoading(prev => ({ ...prev, dashboard: true }));
    try {
      let url = `${API_BASE_URL}/api/dashboard/config`;
      if (userId) {
        url += `?userId=${userId}`;
      }
      
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch dashboard config: ${response.status}`);
      const data = await response.json();
      setDashboardConfig(data.data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error("Error fetching dashboard config:", errorMessage);
    } finally {
      setSectionLoading(prev => ({ ...prev, dashboard: false }));
    }
  };

  const saveDashboardConfig = async (config: DashboardConfig, userId: string): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/dashboard/config?userId=${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });
      
      if (!response.ok) throw new Error(`Failed to save dashboard config: ${response.status}`);
      const data = await response.json();
      setDashboardConfig(data.data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error("Error saving dashboard config:", errorMessage);
      setError("Failed to save dashboard configuration. Please try again later.");
    }
  };

  const createRepository = async (): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/repositories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newRepository),
      });
      
      if (!response.ok) throw new Error(`Failed to create repository: ${response.status}`);
      await fetchRepositories();
      setShowNewRepositoryForm(false);
      setNewRepository({
        name: '',
        url: '',
        owner: '',
        description: '',
        status: 'active'
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error("Error creating repository:", errorMessage);
      setError("Failed to create repository. Please try again later.");
    }
  };
  const updateRepository = async (id: string, data: Partial<Repository>): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/repositories/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) throw new Error(`Failed to update repository: ${response.status}`);
      await fetchRepositories();
      setEditRepository(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error("Error updating repository:", errorMessage);
      setError("Failed to update repository. Please try again later.");
    }
  };

  const deleteRepository = async (id: string): Promise<void> => {
    if (!window.confirm('Are you sure you want to delete this repository? This action cannot be undone.')) {
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/repositories/${id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) throw new Error(`Failed to delete repository: ${response.status}`);
      await fetchRepositories();
      if (selectedRepository === id) {
        setSelectedRepository(null);
        setRepositoryTests([]);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error("Error deleting repository:", errorMessage);
      setError("Failed to delete repository. Please try again later.");
    }
  };
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([
          fetchMetricsSummary(),
          fetchRepositories(),
          fetchTimeSeriesData(timePeriod)
        ]);
      } catch (err) {
        setError("Failed to fetch dashboard data. Please try again later.");
        console.error("Error fetching data:", err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();

    const refreshInterval = setInterval(() => {
      fetchMetricsSummary();
      fetchTimeSeriesData(timePeriod, selectedRepository);
      if (selectedRepository) {
        fetchRepositoryTests(selectedRepository);
      }
    }, 5 * 60 * 1000);
    
    return () => clearInterval(refreshInterval);
  }, [timePeriod]);

  useEffect(() => {
    fetchTimeSeriesData(timePeriod, selectedRepository);
  }, [timePeriod, selectedRepository]);

  useEffect(() => {
    if (selectedRepository) {
      fetchRepositoryTests(selectedRepository);
    } else {
      setRepositoryTests([]);
      setTestStatusCounts({});
    }
  }, [selectedRepository, testSortField, testSortOrder, testStatusFilter, testLimit]);
  const getPassRateTrend = (): string => {
    if (!timeSeriesData || timeSeriesData.length < 2) return "0%";
    
    const latest = timeSeriesData[timeSeriesData.length - 1];
    const previous = timeSeriesData[timeSeriesData.length - 2];
    
    if (!latest || !previous || !latest.total || !previous.total) return "0%";
    
    const latestRate = (latest.passed / latest.total) * 100;
    const previousRate = (previous.passed / previous.total) * 100;
    const diff = latestRate - previousRate;
    
    return diff >= 0 ? `+${diff.toFixed(2)}%` : `${diff.toFixed(2)}%`;
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString();
  };


  const prepareChartData = () => {
    if (!timeSeriesData || timeSeriesData.length === 0) {
      return {
        labels: [],
        datasets: []
      };
    }

    const labels = timeSeriesData.map(item => {
      const date = new Date(item.date);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    return {
      labels,
      datasets: [
        {
          label: 'Passed',
          data: timeSeriesData.map(item => item.passed || 0),
          borderColor: 'rgb(34, 197, 94)', // green-500
          backgroundColor: 'rgba(34, 197, 94, 0.5)',
          tension: 0.2,
          fill: false
        },
        {
          label: 'Failed',
          data: timeSeriesData.map(item => item.failed || 0),
          borderColor: 'rgb(239, 68, 68)', // red-500
          backgroundColor: 'rgba(239, 68, 68, 0.5)',
          tension: 0.2,
          fill: false
        },
        {
          label: 'Skipped',
          data: timeSeriesData.map(item => item.skipped || 0),
          borderColor: 'rgb(250, 204, 21)', // yellow-400
          backgroundColor: 'rgba(250, 204, 21, 0.5)',
          tension: 0.2,
          fill: false
        },
        {
          label: 'Error',
          data: timeSeriesData.map(item => item.error || 0),
          borderColor: 'rgb(156, 163, 175)', // gray-400
          backgroundColor: 'rgba(156, 163, 175, 0.5)',
          tension: 0.2,
          fill: false
        }
      ]
    };
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(156, 163, 175, 0.1)'
        }
      },
      x: {
        grid: {
          display: false
        }
      }
    },
    plugins: {
      legend: {
        position: 'top' as const,
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
      }
    },
    interaction: {
      mode: 'nearest' as const,
      intersect: false,
    },
  };

  const preparePassRateChartData = () => {
    if (!timeSeriesData || timeSeriesData.length === 0) {
      return {
        labels: [],
        datasets: []
      };
    }


    const labels = timeSeriesData.map(item => {
      const date = new Date(item.date);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    const passRates = timeSeriesData.map(item => {
      if (!item.total || item.total === 0) return 0;
      return ((item.passed / item.total) * 100).toFixed(1);
    });

    return {
      labels,
      datasets: [
        {
          label: 'Pass Rate (%)',
          data: passRates,
          borderColor: 'rgb(249, 115, 22)', 
          backgroundColor: 'rgba(249, 115, 22, 0.2)',
          tension: 0.2,
          fill: true,
          borderWidth: 2,
        }
      ]
    };
  };

  const renderRepositories = () => {
    return (
      <>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-base font-bold text-white">Repositories</h3>
          <button 
            onClick={() => setShowNewRepositoryForm(true)}
            className="bg-gray-800 hover:bg-gray-700 text-white border border-[#f97316]/50 px-3 py-1 rounded text-xs transition-all duration-300 flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Add Repository
          </button>
        </div>
        
        {showNewRepositoryForm && (
          <div className="bg-gray-800 p-4 rounded-lg shadow-md mb-4 border border-gray-700">
            <h4 className="text-sm font-semibold text-white mb-3">Add New Repository</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Name</label>
                <input 
                  type="text" 
                  value={newRepository.name} 
                  onChange={(e) => setNewRepository({...newRepository, name: e.target.value})}
                  className="w-full p-1.5 border border-gray-600 rounded bg-gray-700 text-white text-xs focus:outline-none focus:ring-1 focus:ring-[#f97316] focus:border-[#f97316]"
                  placeholder="Repository name"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Owner</label>
                <input 
                  type="text" 
                  value={newRepository.owner} 
                  onChange={(e) => setNewRepository({...newRepository, owner: e.target.value})}
                  className="w-full p-1.5 border border-gray-600 rounded bg-gray-700 text-white text-xs focus:outline-none focus:ring-1 focus:ring-[#f97316] focus:border-[#f97316]"
                  placeholder="Repository owner"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">URL</label>
                <input 
                  type="text" 
                  value={newRepository.url} 
                  onChange={(e) => setNewRepository({...newRepository, url: e.target.value})}
                  className="w-full p-1.5 border border-gray-600 rounded bg-gray-700 text-white text-xs focus:outline-none focus:ring-1 focus:ring-[#f97316] focus:border-[#f97316]"
                  placeholder="Repository URL"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Status</label>
                <select 
                  value={newRepository.status} 
                  onChange={(e) => setNewRepository({...newRepository, status: e.target.value as 'active' | 'inactive' | 'error'})}
                  className="w-full p-1.5 border border-gray-600 rounded bg-gray-700 text-white text-xs focus:outline-none focus:ring-1 focus:ring-[#f97316] focus:border-[#f97316]"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="error">Error</option>
                </select>
              </div>
            </div>
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-300 mb-1">Description</label>
              <textarea 
                value={newRepository.description} 
                onChange={(e) => setNewRepository({...newRepository, description: e.target.value})}
                className="w-full p-1.5 border border-gray-600 rounded bg-gray-700 text-white text-xs focus:outline-none focus:ring-1 focus:ring-[#f97316] focus:border-[#f97316]"
                placeholder="Repository description"
                rows={3}
              />
            </div>
            <div className="flex justify-end space-x-2">
              <button 
                onClick={() => setShowNewRepositoryForm(false)}
                className="bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1 rounded text-xs transition-all duration-300"
              >
                Cancel
              </button>
              <button 
                onClick={createRepository}
                className="bg-gray-700 text-[#f97316] border border-[#f97316] hover:bg-gray-600 px-3 py-1 rounded text-xs transition-all duration-300"
                disabled={!newRepository.name || !newRepository.url || !newRepository.owner}
              >
                Create Repository
              </button>
            </div>
          </div>
        )}
        
        {sectionLoading.repositories ? (
          <div className="flex justify-center items-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#f97316]"></div>
            <span className="ml-3 text-sm text-gray-300">Loading repositories...</span>
          </div>
        ) : (
          <div className="bg-gray-800 rounded-lg shadow-md overflow-hidden border border-gray-700">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-700 border border-indigo-500/30">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Owner</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">URL</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-gray-800 divide-y divide-gray-700">
                  {repositories.length > 0 ? (
                    repositories.map((repo, index) => (
                      <tr key={index} className="hover:bg-gray-700">
                        <td className="px-4 py-2 whitespace-nowrap text-xs font-medium text-gray-300">{repo.name}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-400">{repo.owner}</td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                            ${repo.status === 'active' ? 'bg-green-100 text-green-800' : 
                              repo.status === 'inactive' ? 'bg-yellow-100 text-yellow-800' : 
                              'bg-red-100 text-red-800'}`}>
                            {repo.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-xs text-blue-400 truncate max-w-xs">
                          <a href={repo.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                            {repo.url}
                          </a>
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-400 text-right">
                          <div className="flex justify-end space-x-2">
                            <button 
                              onClick={() => {
                                setActiveTab('tests');
                                setSelectedRepository(repo._id || null);
                              }}
                              className="text-indigo-400 hover:text-indigo-600"
                              title="View Tests"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            </button>
                            <button 
                              onClick={() => setEditRepository(repo)}
                              className="text-blue-400 hover:text-blue-600"
                              title="Edit Repository"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button 
                              onClick={() => repo._id && deleteRepository(repo._id)}
                              className="text-red-400 hover:text-red-600"
                              title="Delete Repository"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-2 text-center text-xs text-gray-400">
                        No repositories found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {editRepository && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 p-4 rounded-lg shadow-md max-w-2xl w-full border border-gray-700">
              <h4 className="text-sm font-semibold text-white mb-3">Edit Repository</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">Name</label>
                  <input 
                    type="text" 
                    value={editRepository.name} 
                    onChange={(e) => setEditRepository({...editRepository, name: e.target.value})}
                    className="w-full p-1.5 border border-gray-600 rounded bg-gray-700 text-white text-xs focus:outline-none focus:ring-1 focus:ring-[#f97316] focus:border-[#f97316]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">Owner</label>
                  <input 
                    type="text" 
                    value={editRepository.owner} 
                    onChange={(e) => setEditRepository({...editRepository, owner: e.target.value})}
                    className="w-full p-1.5 border border-gray-600 rounded bg-gray-700 text-white text-xs focus:outline-none focus:ring-1 focus:ring-[#f97316] focus:border-[#f97316]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">URL</label>
                  <input 
                    type="text" 
                    value={editRepository.url} 
                    onChange={(e) => setEditRepository({...editRepository, url: e.target.value})}
                    className="w-full p-1.5 border border-gray-600 rounded bg-gray-700 text-white text-xs focus:outline-none focus:ring-1 focus:ring-[#f97316] focus:border-[#f97316]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">Status</label>
                  <select 
                    value={editRepository.status} 
                    onChange={(e) => setEditRepository({...editRepository, status: e.target.value as 'active' | 'inactive' | 'error'})}
                    className="w-full p-1.5 border border-gray-600 rounded bg-gray-700 text-white text-xs focus:outline-none focus:ring-1 focus:ring-[#f97316] focus:border-[#f97316]"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="error">Error</option>
                  </select>
                </div>
              </div>
              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-300 mb-1">Description</label>
                <textarea 
                  value={editRepository.description || ''} 
                  onChange={(e) => setEditRepository({...editRepository, description: e.target.value})}
                  className="w-full p-1.5 border border-gray-600 rounded bg-gray-700 text-white text-xs focus:outline-none focus:ring-1 focus:ring-[#f97316] focus:border-[#f97316]"
                  rows={3}
                />
              </div>
              <div className="flex justify-end space-x-2">
                <button 
                  onClick={() => setEditRepository(null)}
                  className="bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1 rounded text-xs transition-all duration-300"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => editRepository._id && updateRepository(editRepository._id, editRepository)}
                  className="bg-gray-700 text-[#f97316] border border-[#f97316] hover:bg-gray-600 px-3 py-1 rounded text-xs transition-all duration-300"
                  disabled={!editRepository.name || !editRepository.url || !editRepository.owner}
                >
                  Update Repository
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  };
  const renderRepositoryTests = () => {
    return (
      <>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-base font-bold text-white">API Tests</h3>
          <div className="flex items-center space-x-2">
            <select 
              value={selectedRepository || ''}
              onChange={(e) => setSelectedRepository(e.target.value || null)}
              className="p-1.5 border border-gray-600 rounded bg-gray-700 text-white text-xs focus:outline-none focus:ring-1 focus:ring-[#f97316] focus:border-[#f97316]"
            >
              <option value="">Select Repository</option>
              {repositories.map((repo, index) => (
                <option key={index} value={repo._id}>
                  {repo.name} ({repo.owner})
                </option>
              ))}
            </select>
          </div>
        </div>
        
        {!selectedRepository ? (
          <div className="bg-gray-800 p-4 rounded-lg shadow-md text-center border border-gray-700">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mx-auto text-gray-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-gray-400">Please select a repository to view its test results</p>
          </div>
        ) : sectionLoading.tests ? (
          <div className="flex justify-center items-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#f97316]"></div>
            <span className="ml-3 text-sm text-gray-300">Loading tests...</span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
              <div 
                className="bg-gray-900 p-3 rounded-lg shadow-md border-t-4 border-green-500 hover:border-green-400 hover:shadow-green-300/50 transition-all duration-300 cursor-pointer"
                onClick={() => setTestStatusFilter(testStatusFilter === 'passed' ? null : 'passed')}
              >
                <h3 className="text-sm font-semibold text-gray-300 mb-1">Passed</h3>
                <p className="text-2xl font-bold text-green-500">{testStatusCounts.passed || 0}</p>
                <div className="mt-1 flex items-center">
                  <div className={`w-2.5 h-2.5 rounded-full mr-1 ${testStatusFilter === 'passed' ? 'bg-green-500' : 'bg-gray-600'}`}></div>
                  <span className="text-xs text-gray-400">{testStatusFilter === 'passed' ? 'Filtered' : 'Click to filter'}</span>
                </div>
              </div>
              
              <div 
                className="bg-gray-900 p-3 rounded-lg shadow-md border-t-4 border-red-500 hover:border-red-400 hover:shadow-red-300/50 transition-all duration-300 cursor-pointer"
                onClick={() => setTestStatusFilter(testStatusFilter === 'failed' ? null : 'failed')}
              >
                <h3 className="text-sm font-semibold text-gray-300 mb-1">Failed</h3>
                <p className="text-2xl font-bold text-red-500">{testStatusCounts.failed || 0}</p>
                <div className="mt-1 flex items-center">
                  <div className={`w-2.5 h-2.5 rounded-full mr-1 ${testStatusFilter === 'failed' ? 'bg-red-500' : 'bg-gray-600'}`}></div>
                  <span className="text-xs text-gray-400">{testStatusFilter === 'failed' ? 'Filtered' : 'Click to filter'}</span>
                </div>
              </div>
              
              <div 
                className="bg-gray-900 p-3 rounded-lg shadow-md border-t-4 border-yellow-400 hover:border-yellow-300 hover:shadow-yellow-100/50 transition-all duration-300 cursor-pointer"
                onClick={() => setTestStatusFilter(testStatusFilter === 'skipped' ? null : 'skipped')}
              >
                <h3 className="text-sm font-semibold text-gray-300 mb-1">Skipped</h3>
                <p className="text-2xl font-bold text-yellow-400">{testStatusCounts.skipped || 0}</p>
                <div className="mt-1 flex items-center">
                  <div className={`w-2.5 h-2.5 rounded-full mr-1 ${testStatusFilter === 'skipped' ? 'bg-yellow-400' : 'bg-gray-600'}`}></div>
                  <span className="text-xs text-gray-400">{testStatusFilter === 'skipped' ? 'Filtered' : 'Click to filter'}</span>
                </div>
              </div>
              
              <div 
                className="bg-gray-900 p-3 rounded-lg shadow-md border-t-4 border-gray-500 hover:border-gray-400 hover:shadow-gray-300/50 transition-all duration-300 cursor-pointer"
                onClick={() => setTestStatusFilter(testStatusFilter === 'error' ? null : 'error')}
              >
                <h3 className="text-sm font-semibold text-gray-300 mb-1">Error</h3>
                <p className="text-2xl font-bold text-gray-500">{testStatusCounts.error || 0}</p>
                <div className="mt-1 flex items-center">
                  <div className={`w-2.5 h-2.5 rounded-full mr-1 ${testStatusFilter === 'error' ? 'bg-gray-500' : 'bg-gray-600'}`}></div>
                  <span className="text-xs text-gray-400">{testStatusFilter === 'error' ? 'Filtered' : 'Click to filter'}</span>
                </div>
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg shadow-md overflow-hidden mb-4 border border-gray-700">
              <div className="p-3 border-b border-gray-700 bg-gray-700 flex justify-between items-center">
                <div className="flex items-center">
                  <h4 className="text-sm font-semibold text-gray-300">Test Results</h4>
                  {testStatusFilter && (
                    <div className="ml-2 flex items-center">
                      <span className="text-xs text-gray-400">Filtered by:</span>
                      <span className={`ml-1 px-2 py-1 text-xs rounded-full ${
                        testStatusFilter === 'passed' ? 'bg-green-100 text-green-800' : 
                        testStatusFilter === 'failed' ? 'bg-red-100 text-red-800' :
                        testStatusFilter === 'skipped' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {testStatusFilter}
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setTestStatusFilter(null);
                          }}
                          className="ml-1 focus:outline-none"
                        >
                          ×
                        </button>
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <select 
                    value={testLimit}
                    onChange={(e) => setTestLimit(Number(e.target.value))}
                    className="p-1.5 border border-gray-600 rounded bg-gray-700 text-white text-xs focus:outline-none focus:ring-1 focus:ring-[#f97316] focus:border-[#f97316]"
                  >
                    <option value="10">10 rows</option>
                    <option value="20">20 rows</option>
                    <option value="50">50 rows</option>
                    <option value="100">100 rows</option>
                  </select>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700 border border-indigo-500/30">
                  <thead className="bg-gray-700">
                    <tr>
                      <th 
                        className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600"
                        onClick={() => {
                          if (testSortField === 'name') {
                            setTestSortOrder(testSortOrder === 'asc' ? 'desc' : 'asc');
                          } else {
                            setTestSortField('name');
                            setTestSortOrder('asc');
                          }
                        }}
                      >
                        <div className="flex items-center">
                          Test Name
                          {testSortField === 'name' && (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={
                                testSortOrder === 'asc' 
                                  ? "M5 15l7-7 7 7" 
                                  : "M19 9l-7 7-7-7"
                              } />
                            </svg>
                          )}
                        </div>
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                      <th 
                        className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600"
                        onClick={() => {
                          if (testSortField === 'duration') {
                            setTestSortOrder(testSortOrder === 'asc' ? 'desc' : 'asc');
                          } else {
                            setTestSortField('duration');
                            setTestSortOrder('asc');
                          }
                        }}
                      >
                        <div className="flex items-center">
                          Duration (ms)
                          {testSortField === 'duration' && (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={
                                testSortOrder === 'asc' 
                                  ? "M5 15l7-7 7 7" 
                                  : "M19 9l-7 7-7-7"
                              } />
                            </svg>
                          )}
                        </div>
                      </th>
                      <th 
                        className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-600"
                        onClick={() => {
                          if (testSortField === 'executedAt') {
                            setTestSortOrder(testSortOrder === 'asc' ? 'desc' : 'asc');
                          } else {
                            setTestSortField('executedAt');
                            setTestSortOrder('desc');
                          }
                        }}
                      >
                        <div className="flex items-center">
                          Executed At
                          {testSortField === 'executedAt' && (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={
                                testSortOrder === 'asc' 
                                  ? "M5 15l7-7 7 7" 
                                  : "M19 9l-7 7-7-7"
                              } />
                            </svg>
                          )}
                        </div>
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Endpoint</th>
                    </tr>
                  </thead>
                  <tbody className="bg-gray-800 divide-y divide-gray-700">
                    {repositoryTests.length > 0 ? (
                      repositoryTests.map((test, index) => (
                        <tr key={index} className="hover:bg-gray-700">
                          <td className="px-4 py-2 whitespace-nowrap text-xs font-medium text-gray-300">
                            {test.name}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                              ${test.status === 'passed' ? 'bg-green-100 text-green-800' : 
                                test.status === 'failed' ? 'bg-red-100 text-red-800' : 
                                test.status === 'skipped' ? 'bg-yellow-100 text-yellow-800' : 
                                'bg-gray-100 text-gray-800'}`}>
                              {test.status}
                            </span>
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-400">
                            {test.duration} ms
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-400">
                            {formatDate(test.executedAt)}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-400">
                            {test.endpoint ? (
                              <span className="flex items-center">
                                <span className={`px-2 mr-2 text-xs font-semibold rounded 
                                  ${test.method === 'GET' ? 'bg-blue-100 text-blue-800' : 
                                    test.method === 'POST' ? 'bg-green-100 text-green-800' : 
                                    test.method === 'PUT' ? 'bg-yellow-100 text-yellow-800' : 
                                    test.method === 'DELETE' ? 'bg-red-100 text-red-800' : 
                                    'bg-gray-100 text-gray-800'}`}>
                                  {test.method}
                                </span>
                                {test.endpoint}
                              </span>
                            ) : (
                              'N/A'
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-4 py-2 text-center text-xs text-gray-400">
                          No test results found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </>
    );
  };
  const renderDashboardSettings = () => {
    return (
      <>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-base font-bold text-white">Dashboard Settings</h3>
        </div>
        
        {sectionLoading.dashboard ? (
          <div className="flex justify-center items-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#f97316]"></div>
            <span className="ml-3 text-sm text-gray-300">Loading settings...</span>
          </div>
        ) : (
          <div className="bg-gray-800 p-4 rounded-lg shadow-md border border-gray-700">
            <h4 className="text-sm font-semibold text-white mb-3">Dashboard Configuration</h4>
            {dashboardConfig ? (
              <div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1">Name</label>
                    <input
                      type="text"
                      value={dashboardConfig.name}
                      onChange={(e) => setDashboardConfig({...dashboardConfig, name: e.target.value})}
                      className="w-full p-1.5 border border-gray-600 rounded bg-gray-700 text-white text-xs focus:outline-none focus:ring-1 focus:ring-[#f97316] focus:border-[#f97316]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-1">Description</label>
                    <input
                      type="text"
                      value={dashboardConfig.description || ''}
                      onChange={(e) => setDashboardConfig({...dashboardConfig, description: e.target.value})}
                      className="w-full p-1.5 border border-gray-600 rounded bg-gray-700 text-white text-xs focus:outline-none focus:ring-1 focus:ring-[#f97316] focus:border-[#f97316]"
                    />
                  </div>
                </div>
                
                <div className="mt-4">
                  <h5 className="text-xs font-semibold text-gray-300 mb-2">Widgets</h5>
                  <div className="space-y-3">
                    {dashboardConfig.widgets.map((widget, index) => (
                      <div key={index} className="border border-gray-600 p-3 rounded-lg">
                        <div className="flex justify-between items-center mb-2">
                          <h6 className="text-xs font-medium text-gray-300">{widget.title}</h6>
                          <div className="flex space-x-2">
                            <button className="text-gray-400 hover:text-gray-300">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
                          <div>
                            <span className="text-gray-500">Type:</span> {widget.type}
                          </div>
                          <div>
                            <span className="text-gray-500">Data Source:</span> {widget.dataSource}
                          </div>
                          <div>
                            <span className="text-gray-500">Position:</span> 
                            {`(${widget.position.x}, ${widget.position.y}), ${widget.position.w}x${widget.position.h}`}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => dashboardConfig.userId && saveDashboardConfig(dashboardConfig, dashboardConfig.userId)}
                    className="bg-gray-700 text-[#f97316] border border-[#f97316] hover:bg-gray-600 px-3 py-1 rounded text-xs transition-all duration-300"
                  >
                    Save Configuration
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-400 mb-3">No custom dashboard configuration found</p>
                <button
                  onClick={() => fetchDashboardConfig("default")}
                  className="bg-gray-700 text-[#f97316] border border-[#f97316] hover:bg-gray-600 px-3 py-1 rounded text-xs transition-all duration-300"
                >
                  Load Default Configuration
                </button>
              </div>
            )}
          </div>
        )}
      </>
    );
  };

  const renderMetricsDashboard = () => {
    return (
      <>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-white">API Testing Metrics</h3>
          <div className="flex space-x-2">
            <button 
              onClick={() => setTimePeriod('24h')}
              className={`px-2 py-1 rounded text-xs transition-all duration-300 ${
                timePeriod === '24h' 
                  ? 'bg-[#f97316] text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              24h
            </button>
            <button 
              onClick={() => setTimePeriod('7d')}
              className={`px-2 py-1 rounded text-xs transition-all duration-300 ${
                timePeriod === '7d' 
                  ? 'bg-[#f97316] text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              7d
            </button>
            <button 
              onClick={() => setTimePeriod('30d')}
              className={`px-2 py-1 rounded text-xs transition-all duration-300 ${
                timePeriod === '30d' 
                  ? 'bg-[#f97316] text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              30d
            </button>
            <button 
              onClick={() => setTimePeriod('90d')}
              className={`px-2 py-1 rounded text-xs transition-all duration-300 ${
                timePeriod === '90d' 
                  ? 'bg-[#f97316] text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              90d
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div className="bg-gray-900 p-4 rounded-md shadow-md border border-indigo-500/50 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center space-x-2 mb-3">
              <div className="p-1 bg-[#f97316]/20 rounded">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#f97316]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-gray-300">Pass Rate</h3>
            </div>
            <p className="text-2xl font-bold text-[#f97316]">{metricsData?.passRate || "0"}%</p>
            <div className="mt-2 text-xs text-gray-400">{getPassRateTrend()} from previous period</div>
          </div>
          
          <div className="bg-gray-900 p-4 rounded-md shadow-md border border-indigo-500/50 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center space-x-2 mb-3">
              <div className="p-1 bg-[#f97316]/20 rounded">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#f97316]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-gray-300">Total Repositories</h3>
            </div>
            <p className="text-2xl font-bold text-[#f97316]">{metricsData?.totalRepositories || 0}</p>
            <div className="mt-2 text-xs text-gray-400">Actively monitored repositories</div>
          </div>
          
          <div className="bg-gray-900 p-4 rounded-md shadow-md border border-indigo-500/50 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center space-x-2 mb-3">
              <div className="p-1 bg-[#f97316]/20 rounded">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#f97316]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-gray-300">Total Tests</h3>
            </div>
            <p className="text-2xl font-bold text-[#f97316]">{metricsData?.totalTests || 0}</p>
            <div className="mt-2 text-xs text-gray-400">{metricsData?.testsLast7Days || 0} tests in last {timePeriod}</div>
          </div>
          
          <div className="bg-gray-900 p-4 rounded-md shadow-md border border-indigo-500/50 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center space-x-2 mb-3">
              <div className="p-1 bg-[#f97316]/20 rounded">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#f97316]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-gray-300">Avg Duration</h3>
            </div>
            <p className="text-2xl font-bold text-[#f97316]">{metricsData?.averageDuration || 0} ms</p>
            <div className="mt-2 text-xs text-gray-400">Average test execution time</div>
          </div>
        </div>
        <h3 className="text-lg font-bold mb-3 text-white">Test Results by Status</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div className="bg-gray-900 p-3 rounded-lg shadow-md border-t-4 border-green-500 hover:border-green-400 hover:shadow-green-300/50 transition-all duration-300">
            <h3 className="text-sm font-semibold text-gray-300 mb-1">Passed</h3>
            <p className="text-2xl font-bold text-green-500">{metricsData?.testsByStatus?.passed || 0}</p>
            <div className="mt-1 bg-gray-600 h-1.5 rounded-full">
              <div 
                className="bg-green-500 h-1.5 rounded-full" 
                style={{ 
                  width: `${metricsData && metricsData.totalTests ? 
                    (metricsData.testsByStatus.passed / metricsData.totalTests) * 100 : 0}%` 
                }}
              ></div>
            </div>
          </div>
          
          <div className="bg-gray-900 p-3 rounded-lg shadow-md border-t-4 border-red-500 hover:border-red-400 hover:shadow-red-300/50 transition-all duration-300">
            <h3 className="text-sm font-semibold text-gray-300 mb-1">Failed</h3>
            <p className="text-2xl font-bold text-red-500">{metricsData?.testsByStatus?.failed || 0}</p>
            <div className="mt-1 bg-gray-600 h-1.5 rounded-full">
              <div 
                className="bg-red-500 h-1.5 rounded-full" 
                style={{ 
                  width: `${metricsData && metricsData.totalTests ? 
                    (metricsData.testsByStatus.failed / metricsData.totalTests) * 100 : 0}%` 
                }}
              ></div>
            </div>
          </div>
          
          <div className="bg-gray-900 p-3 rounded-lg shadow-md border-t-4 border-yellow-400 hover:border-yellow-300 hover:shadow-yellow-100/50 transition-all duration-300">
            <h3 className="text-sm font-semibold text-gray-300 mb-1">Skipped</h3>
            <p className="text-2xl font-bold text-yellow-400">{metricsData?.testsByStatus?.skipped || 0}</p>
            <div className="mt-1 bg-gray-600 h-1.5 rounded-full">
              <div 
                className="bg-yellow-400 h-1.5 rounded-full" 
                style={{ 
                  width: `${metricsData && metricsData.totalTests ? 
                    (metricsData.testsByStatus.skipped / metricsData.totalTests) * 100 : 0}%` 
                }}
              ></div>
            </div>
          </div>
          
          <div className="bg-gray-900 p-3 rounded-lg shadow-md border-t-4 border-gray-500 hover:border-gray-400 hover:shadow-gray-300/50 transition-all duration-300">
            <h3 className="text-sm font-semibold text-gray-300 mb-1">Error</h3>
            <p className="text-2xl font-bold text-gray-500">{metricsData?.testsByStatus?.error || 0}</p>
            <div className="mt-1 bg-gray-600 h-1.5 rounded-full">
              <div 
                className="bg-gray-500 h-1.5 rounded-full" 
                style={{ 
                  width: `${metricsData && metricsData.totalTests ? 
                    (metricsData.testsByStatus.error / metricsData.totalTests) * 100 : 0}%` 
                }}
              ></div>
            </div>
          </div>
        </div>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-bold text-white">Test Results Over Time</h3>
          <select 
            value={selectedRepository || ''}
            onChange={(e) => setSelectedRepository(e.target.value || null)}
            className="p-1.5 border border-gray-600 rounded bg-gray-700 text-white text-xs focus:outline-none focus:ring-1 focus:ring-[#f97316] focus:border-[#f97316]"
          >
            <option value="">All Repositories</option>
            {repositories.map((repo, index) => (
              <option key={index} value={repo._id}>
                {repo.name} ({repo.owner})
              </option>
            ))}
          </select>
        </div>
        <div className="bg-gray-800 p-4 rounded-lg shadow-md mb-6 border border-gray-700">
          <div className="flex justify-between items-center mb-3">
            <div className="text-sm font-semibold text-gray-300">
              Pass Rate Trend ({timePeriod})
            </div>
          </div>
          
          <div className="h-64">
            <Line data={preparePassRateChartData()} options={{
              ...chartOptions,
              plugins: {
                ...chartOptions.plugins,
                title: {
                  display: true,
                  text: 'API Test Pass Rate (%)'
                }
              }
            }} />
          </div>
        </div>

        <div className="bg-gray-800 p-4 rounded-lg shadow-md mb-6 border border-gray-700">
          <div className="flex justify-between items-center mb-3">
            <div className="text-sm font-semibold text-gray-300">
              {selectedRepository 
                ? `${repositories.find(r => r._id === selectedRepository)?.name || 'Repository'} Results` 
                : `All Repositories Results`} 
              ({timePeriod})
            </div>
          </div>
          
          <div className="h-64">
            {timeSeriesData.length > 0 ? (
              <Line data={prepareChartData()} options={chartOptions} />
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-400">
                No time series data available
              </div>
            )}
          </div>
        </div>

        <h3 className="text-lg font-bold mb-3 text-white">Recent Repositories</h3>
        <div className="bg-gray-800 rounded-lg shadow-md overflow-hidden mb-6 border border-gray-700">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-700 border border-indigo-500/30">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Owner</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">URL</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-gray-800 divide-y divide-gray-700">
                {repositories.length > 0 ? (
                  repositories.slice(0, 5).map((repo, index) => (
                    <tr key={index} className="hover:bg-gray-700">
                      <td className="px-4 py-2 whitespace-nowrap text-xs font-medium text-gray-300">{repo.name}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-400">{repo.owner}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                          ${repo.status === 'active' ? 'bg-green-100 text-green-800' : 
                            repo.status === 'inactive' ? 'bg-yellow-100 text-yellow-800' : 
                            'bg-red-100 text-red-800'}`}>
                          {repo.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-xs text-blue-400 truncate max-w-xs">
                        <a href={repo.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          {repo.url}
                        </a>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-400 text-right">
                        <button 
                          onClick={() => {
                            setActiveTab('tests');
                            setSelectedRepository(repo._id || null);
                          }}
                          className="text-indigo-400 hover:text-indigo-600"
                          title="View Tests"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-2 text-center text-xs text-gray-400">
                      No repositories found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1F2B39] to-[#162029]">
      <Sidebar 
        sidebarCollapsed={sidebarCollapsed} 
        activeTab={activeTab} 
        toggleSidebar={toggleSidebar} 
        handleTabChange={handleTabChange} 
      />
      <div className={`flex-1 ${sidebarCollapsed ? 'ml-14' : 'ml-56'} flex flex-col h-screen`}>
        <div className="bg-[#1F2B39] text-white py-2 px-4 border-b border-[#FF7D2D]/30 flex justify-between items-center sticky top-0 z-10">
          <div className="text-base font-medium">API Testing Dashboard</div>
          <div className="flex items-center space-x-3">
            <div className="flex items-center">
              <span className={`h-2 w-2 rounded-full mr-2 ${
                wsStatus === 'connected' ? 'bg-green-500' : 
                wsStatus === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'
              }`}></span>
              <span className="text-xs hidden md:inline">
                {wsStatus === 'connected' ? 'Live' : 
                 wsStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
              </span>
            </div>
            <button className="bg-[#2C3E50] text-white hover:text-[#FF7D2D] border border-[#FF7D2D]/30 px-3 py-1 rounded text-xs transition-all duration-300">
              Logout
            </button>
          </div>
        </div>
        <div className="p-4 flex-1 overflow-y-auto hide-scrollbar">
          {wsStatus === 'disconnected' && (
            <div className="bg-yellow-500/10 text-yellow-200 p-3 rounded mb-4 flex items-center text-xs">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>
                Live data connection lost. Attempting to reconnect... 
                <button 
                  onClick={connectWebSocket}
                  className="ml-1 underline hover:text-white"
                >
                  Reconnect now
                </button>
              </span>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center items-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#FF7D2D]"></div>
              <span className="ml-3 text-sm text-gray-300">Loading dashboard data...</span>
            </div>
          ) : error ? (
            <div className="bg-red-500/10 text-red-200 p-3 rounded text-xs">
              <div className="flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
              <button 
                onClick={() => window.location.reload()}
                className="mt-2 bg-red-500/20 hover:bg-red-500/30 text-white px-3 py-1 rounded text-xs transition-colors duration-300"
              >
                Refresh Page
              </button>
            </div>
          ) : (
            <>
              {activeTab === 'metrics' && renderMetricsDashboard()}
              {activeTab === 'repositories' && renderRepositories()}
              {activeTab === 'tests' && renderRepositoryTests()}
              {activeTab === 'settings' && renderDashboardSettings()}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;