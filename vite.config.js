import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    {
      name: 'project-form-route-rewrite',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          const requestUrl = req.url || '';

          if (/^\/projects\/new\/?$/.test(requestUrl) || /^\/projects\/[^/]+\/edit\/?$/.test(requestUrl) || /^\/project\/[^/]+\/(add|edit)\/?$/.test(requestUrl)) {
            req.url = '/project/';
          }

          if (/^\/project\/[^/]+\/tasks\/?$/.test(requestUrl)) {
            req.url = '/project-tasks/';
          }

          if (/^\/project\/[^/]+\/labels\/?$/.test(requestUrl)) {
            req.url = '/project-labels/';
          }

          if (/^\/project\/[^/]+\/deadlines\/?$/.test(requestUrl)) {
            req.url = '/project-deadlines/';
          }

          if (/^\/projects\/[^/]+\/users\/?$/.test(requestUrl)) {
            req.url = '/project-users/';
          }

          next();
        });
      }
    }
  ],
  server: {
    port: 5173,
    open: '/'
  },
  build: {
    rollupOptions: {
      input: {
        index: 'index.html',
        dashboard: 'dashboard/index.html',
        login: 'login/index.html',
        register: 'register/index.html',
        admin: 'admin/index.html',
        projects: 'projects/index.html',
        project: 'project/index.html',
        projectTasks: 'project-tasks/index.html',
        projectLabels: 'project-labels/index.html',
        projectDeadlines: 'project-deadlines/index.html',
        projectUsers: 'project-users/index.html'
      }
    }
  }
});
