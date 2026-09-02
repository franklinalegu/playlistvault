import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { SettingsProvider } from '@/contexts/SettingsContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { QueueProvider } from '@/contexts/QueueContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { FirstRunWizard } from '@/components/FirstRunWizard';
import { YtDlpUpdateNotice } from '@/components/YtDlpUpdateNotice';
import { AppUpdateBanner } from '@/components/AppUpdateBanner';
import { Sidebar } from '@/components/Sidebar';
import { TitleBar } from '@/components/TitleBar';
import { Background } from '@/components/Background';
import { Home } from '@/pages/Home';
import { Downloads } from '@/pages/Downloads';
import { History } from '@/pages/History';
import { Settings } from '@/pages/Settings';
import { About } from '@/pages/About';

export default function App(): JSX.Element {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <SettingsProvider>
          <QueueProvider>
            <YtDlpUpdateNotice />
            <AppUpdateBanner />
            {/* HashRouter avoids file:// path issues in the packaged build. */}
            <HashRouter>
              <FirstRunWizard>
              <Background />
              <div className="flex h-full">
                <Sidebar />
                <div className="flex min-w-0 flex-1 flex-col">
                  <TitleBar />
                  <main className="flex-1 overflow-y-auto">
                    <AnimatePresence mode="wait">
                      <Routes>
                        <Route path="/" element={<Home />} />
                        <Route path="/downloads" element={<Downloads />} />
                        <Route path="/history" element={<History />} />
                        <Route path="/settings" element={<Settings />} />
                        <Route path="/about" element={<About />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                      </Routes>
                    </AnimatePresence>
                  </main>
                </div>
              </div>
              </FirstRunWizard>
            </HashRouter>
          </QueueProvider>
        </SettingsProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
