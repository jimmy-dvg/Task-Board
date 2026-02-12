import './styles/global.css';
import { renderHeader } from './components/header/header.js';
import { renderFooter } from './components/footer/footer.js';
import { renderRegisterPage } from './pages/register/register.js';

const app = document.querySelector('#app');

document.title = 'Taskboard | Register';

if (app) {
  app.className = 'app-shell';
  app.append(renderHeader('/register'));
  app.append(renderRegisterPage());
  app.append(renderFooter());
}
