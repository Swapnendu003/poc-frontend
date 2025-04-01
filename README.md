# Dashboard POC

## ✨ Features

- **Real-time Monitoring**: Live updates of test results via WebSocket connections
- **Comprehensive Metrics**: Track pass rates, execution times, and test statuses
- **Repository Management**: Organize your API tests by repositories
- **Test Results History**: View historical test results with detailed information
- **Customizable Dashboard**: Configure your dashboard to show the metrics that matter most to you
- **Time Series Analysis**: Analyze trends in your API test results over time
- **Responsive Design**: Access your dashboard from any device with a fully responsive UI

## 🖥️ Dashboard Overview

The Keploy Dashboard consists of several key sections:

### Metrics Dashboard

The main overview page showing:
- Pass rate trends
- Total repositories and tests
- Test status distribution
- Time series charts for test results
- Recent repository activity

### Repositories

Manage your repositories with:
- Add, edit, and delete repositories
- View repository status
- Direct access to test results for each repository

### Tests

Detailed view of test results:
- Filter by test status (passed, failed, skipped, error)
- Sort by various fields (name, duration, execution time)
- View endpoint and method information
- Status count summaries

### Settings

Configure your dashboard:
- Customize dashboard name and description
- Manage dashboard widgets
- Set up user preferences

## 🔧 Technical Architecture

Keploy Dashboard is built with modern technologies:

- **Frontend**: React with TypeScript
- **State Management**: React Hooks for local state management
- **UI Components**: Custom-styled components with a dark theme
- **Charting**: Chart.js with React integration
- **Real-time Updates**: WebSocket connections with automatic reconnection
- **API Communication**: RESTful API endpoints

## 🚀 Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Swapnendu003/poc-frontend.git
   cd dashboard
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   ```

3. Start the development server:
   ```bash
   npm run dev
   # or
   yarn dev
   ```

4. Build for production:
   ```bash
   npm run build
   # or
   yarn build
   ```

## 📊 API Integration

The dashboard connects to the Keploy API for data. Key endpoints include:

- `/api/metrics/summary` - Get overall metrics summary
- `/api/repositories` - Manage repositories
- `/api/metrics/time-series` - Get time series data for charts
- `/api/metrics/repositories/{id}/tests` - Get tests for a specific repository
- `/api/dashboard/config` - Manage dashboard configuration

## 🔄 Real-time Updates

The dashboard maintains a WebSocket connection to receive real-time updates:

- Live test results
- Repository status changes
- Metrics updates

The connection includes automatic reconnection with exponential backoff to handle network issues.

## 🎨 Customization

You can customize your dashboard experience by:

1. Selecting different time periods (24h, 7d, 30d, 90d)
2. Filtering test results by status
3. Configuring dashboard widgets
4. Sorting and limiting test results
5. Focusing on specific repositories

## 🛠️ Development

### Project Structure

```
/src
├── components/         # Reusable UI components
│   ├── Sidebar.tsx    # Navigation sidebar
│   └── ui/            # UI component library
├── constants/         # Application constants
├── types/             # TypeScript type definitions
└── app/               # Application pages
    └── dashboard/     # Dashboard page components
```

### Key Files

- `page.tsx` - The landing page with wavy background
- `Dashboard.tsx` - The main dashboard component
- `Sidebar.tsx` - Navigation sidebar component
- `types/dashboardTypes.ts` - TypeScript interfaces for the dashboard


---

Built with ❤️ by Swapnendu Banerjee