import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

const PROJECT_ID_KEY = 'cpq-project-id';
const LAST_PAGE_KEY = 'cpq-last-page';

/** Track last visited page (excludes /projects) */
export function usePageTracker() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (pathname !== '/projects') {
      localStorage.setItem(LAST_PAGE_KEY, pathname);
    }
  }, [pathname]);
}

/**
 * On mount at "/", checks if a saved project exists in the cloud.
 * - If valid → navigates to the last visited page (or "/" stays).
 * - If missing/deleted → redirects to /projects.
 * - If no saved project → redirects to /projects.
 */
export function useAutoRedirect() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    // Only run on the root route
    if (pathname !== '/') return;

    const storedId = localStorage.getItem(PROJECT_ID_KEY);

    if (!storedId) {
      navigate('/projects', { replace: true });
      return;
    }

    // Verify the project still exists
    supabase
      .from('projects')
      .select('id')
      .eq('id', storedId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) {
          // Project was deleted — clear and go to projects
          localStorage.removeItem(PROJECT_ID_KEY);
          navigate('/projects', { replace: true });
        } else {
          // Project exists — restore last page if it wasn't root
          const lastPage = localStorage.getItem(LAST_PAGE_KEY);
          if (lastPage && lastPage !== '/') {
            navigate(lastPage, { replace: true });
          }
          // else stay on "/"
        }
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
