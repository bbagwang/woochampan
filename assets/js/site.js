// 우참판 — small enhancements only: header state, mobile menu, reveal on scroll, opening status.
(() => {
  const root = document.documentElement;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.classList.add('ready');

  // header: solid (and showing the logo) once the hero logo has scrolled away
  const header = $('[data-header]');
  const heroLogo = $('.hero__logo');
  const onScroll = () => {
    const past = heroLogo ? heroLogo.getBoundingClientRect().bottom < 0 : scrollY > 40;
    header.classList.toggle('is-solid', past || scrollY > innerHeight * .6);
  };
  addEventListener('scroll', onScroll, { passive: true }); addEventListener('resize', onScroll); onScroll();

  // mobile menu
  const toggle = $('[data-menu-toggle]');
  const blockers = [$('main'), $('footer')];
  const setMenu = open => {
    header.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', open);
    toggle.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
    document.body.style.overflow = open ? 'hidden' : '';
    blockers.forEach(el => { if (el) el.inert = open; });
    if (open) $('.hd__nav a').focus();
  };
  toggle.addEventListener('click', () => setMenu(!header.classList.contains('is-open')));
  $$('.hd__nav a').forEach(a => a.addEventListener('click', () => setMenu(false)));
  addEventListener('keydown', e => { if (e.key === 'Escape' && header.classList.contains('is-open')) { setMenu(false); toggle.focus(); } });
  matchMedia('(min-width: 901px)').addEventListener('change', e => { if (e.matches) setMenu(false); });

  // active section in the nav
  const links = $$('.hd__nav a');
  const navIO = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) links.forEach(a => a.classList.toggle('is-active', a.hash === '#' + e.target.id));
  }), { rootMargin: '-45% 0px -50% 0px' });
  ['about', 'menu', 'space', 'visit', 'branches'].forEach(id => { const s = document.getElementById(id); if (s) navIO.observe(s); });

  // gentle reveal
  const items = $$('[data-reveal]');
  if (reduced || !('IntersectionObserver' in window)) items.forEach(el => el.classList.add('is-in'));
  else {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -8% 0px', threshold: .12 });
    items.forEach(el => {
      const sibs = [...el.parentElement.children].filter(c => c.hasAttribute('data-reveal'));
      el.style.transitionDelay = `${Math.min(sibs.indexOf(el), 4) * 80}ms`;
      io.observe(el);
    });
  }

  // message to the owner (dialog)
  const owner = $('[data-owner]');
  if (owner && typeof owner.showModal === 'function') {
    let opener = null;
    $$('[data-owner-open]').forEach(b => b.addEventListener('click', () => { opener = b; owner.showModal(); }));
    owner.addEventListener('click', e => { if (e.target === owner) owner.close(); });   // click on the backdrop
    owner.addEventListener('close', () => { if (opener) opener.focus(); });
  } else {
    $$('[data-owner-open]').forEach(b => b.addEventListener('click', () => { location.href = 'mailto:bbagwang@gmail.com'; }));
  }

  // opening status, in Seoul time
  const status = $('[data-status]');
  const pad = n => String(n).padStart(2, '0');
  const paint = () => {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const day = now.getDay(), m = now.getHours() * 60 + now.getMinutes();
    const s = day >= 1 && day <= 5
      ? { open: 690, b0: 870, b1: 1020, close: 1320, lo: 1260 }
      : { open: 690, b0: 900, b1: 1020, close: 1290, lo: 1230 };
    const hm = x => `${pad(Math.floor(x / 60))}:${pad(x % 60)}`;
    let text, open = false;
    if (m < s.open) text = `오늘 ${hm(s.open)} 오픈`;
    else if (m < s.b0) { text = `영업 중 · 브레이크 ${hm(s.b0)}`; open = true; }
    else if (m < s.b1) text = `브레이크 타임 · ${hm(s.b1)} 오픈`;
    else if (m < s.close) { text = `영업 중 · 라스트오더 ${hm(s.lo)}`; open = true; }
    else text = '영업 종료 · 내일 11:30 오픈';
    if (status) { status.textContent = text; status.classList.toggle('is-open', open); }
    $$('.hours tr').forEach(tr => tr.classList.toggle('is-today', tr.dataset.days.split(',').includes(String(day))));
  };
  paint(); setInterval(paint, 60000);
})();
