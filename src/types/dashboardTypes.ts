export interface Repository {
  _id?: string;
  name: string;
  owner: string;
  status: 'active' | 'inactive' | 'error';
  url: string;
  description?: string;
}

export interface MetricsData {
  passRate: number;
  totalRepositories: number;
  totalTests: number;
  testsLast7Days: number;
  averageDuration: number;
  testsByStatus: {
    passed: number;
    failed: number;
    skipped: number;
    error: number;
  };
}

export interface TimeSeriesDataPoint {
  date: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  error?: number;
  avgDuration?: number;
}

export interface TestResult {
  _id: string;
  repositoryId: string;
  name: string;
  status: 'passed' | 'failed' | 'skipped' | 'error';
  duration: number;
  executedAt: string;
  endpoint?: string;
  method?: string;
  details?: {
    error?: string;
    requestBody?: any;
    responseBody?: any;
    statusCode?: number;
  };
}

export interface RepositoryTestsResponse {
  success: boolean;
  count: number;
  statusCounts: {
    passed: number;
    failed: number;
    skipped: number;
    error: number;
  };
  data: TestResult[];
}

export interface DashboardWidget {
  type: 'chart' | 'metric' | 'table' | 'status';
  title: string;
  dataSource: string;
  position: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  config: any;
}

export interface DashboardConfig {
  _id?: string;
  name: string;
  description?: string;
  userId?: string;
  isDefault?: boolean;
  widgets: DashboardWidget[];
  createdAt?: string;
  updatedAt?: string;
}

export interface WebSocketMessage {
  type: string;
  data?: any;
}
