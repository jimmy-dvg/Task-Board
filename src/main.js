import './styles/global.css';
import { renderHeader } from './components/header/header.js';
import { renderFooter } from './components/footer/footer.js';
import { renderIndexPage } from './pages/index/index.js';

const app = document.querySelector('#app');

document.title = 'Taskboard | Home';

async function initHome() {
  if (!app) {
    return;
  }

  app.className = 'app-shell';
  app.append(renderHeader('/'));
  const indexPage = await renderIndexPage();
  app.append(indexPage);
  app.append(renderFooter());
}

initHome();
