import template from './index.html?raw';
import './index.css';
import { supabase } from '../../lib/supabase-client.js';

export async function renderIndexPage() {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = template;

  const page = wrapper.firstElementChild;
  const heroElement = page.querySelector('.home-hero');

  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!heroElement || !session) {
    return page;
  }

  heroElement.classList.add('home-hero-auth');
  heroElement.innerHTML = `
    <div class="col-lg-10 px-0">
      <span class="home-hero-chip">TASKBOARD</span>
      <h1 class="home-hero-title">Plan work, track progress, stay aligned.</h1>
      <p class="home-hero-copy mb-4">
        Taskboard is a Trello-style workflow app built for teams and solo makers. Create projects,
        organize tasks into stages, and drag cards across your board as work moves from idea to done.
      </p>
      <a class="btn btn-primary btn-lg px-4" href="/dashboard/">
        <i class="bi bi-grid-1x2-fill me-2" aria-hidden="true"></i>
        Dashboard
      </a>
    </div>
  `;

  return page;
}
