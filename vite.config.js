import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    {
      name: 'project-form-route-rewrite',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          const requestUrl = req.url || '';

          if (/^\/project\/[^/]+\/(add|edit)\/?$/.test(requestUrl)) {
            req.url = '/project/';
          }

          if (/^\/project\/[^/]+\/tasks\/?$/.test(requestUrl)) {
            req.url = '/project-tasks/';
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
        projects: 'projects/index.html',
        project: 'project/index.html',
        projectTasks: 'project-tasks/index.html',
        projectUsers: 'project-users/index.html'
      }
    }
  }
});
