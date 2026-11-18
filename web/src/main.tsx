import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from '@/lib/theme'
import { SettingsProvider } from '@/lib/settingsContext'
import { PeopleFilterProvider } from '@/lib/people-filter'
import { getRefreshIntervalMs } from '@/lib/settingsStorage'
import './styles/globals.css'
import App from './App.tsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: getRefreshIntervalMs(),
      // Opening another page within this window reuses what was just loaded instead of downloading it again.
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 2,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SettingsProvider>
          <PeopleFilterProvider>
            <TooltipProvider delayDuration={150}>
              <App />
            </TooltipProvider>
          </PeopleFilterProvider>
        </SettingsProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)
