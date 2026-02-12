import './styles/global.css';
import { renderHeader } from './components/header/header.js';
import { renderFooter } from './components/footer/footer.js';
import { renderIndexPage } from './pages/index/index.js';

const app = document.querySelector('#app');

document.title = 'Taskboard | Home';

if (app) {
  app.className = 'app-shell';
  app.append(renderHeader('/'));
  app.append(renderIndexPage());
  app.append(renderFooter());
}
