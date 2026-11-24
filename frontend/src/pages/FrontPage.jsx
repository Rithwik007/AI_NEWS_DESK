import React from 'react';
import { Link } from 'react-router-dom';

import EditionPreview from '../components/EditionPreview';

export default function FrontPage() {
  return (
    <main className="front-page">
      <header className="masthead"><strong>AI News Desk</strong><Link to="/login">Sign in ↗</Link></header>
      <div className="front-grid">
        <section className="front-intro">
          <h1>Your personal<br /><em>AI briefing.</em></h1>
          <p>Choose the topics you follow. Your desk groups overlapping coverage and sends the stories that match, twice a day.</p>
          <Link className="front-action" to="/digest">Open your desk <span aria-hidden="true">→</span></Link>
        </section>
        <EditionPreview />
      </div>
      <section className="front-details" aria-label="How your briefing is made">
        <div><h2>Sources</h2><p>Research labs, technical publications and community feeds.</p></div>
        <div><h2>Story selection</h2><p>Related articles are grouped, then ranked by the interests you set.</p></div>
        <div><h2>Delivery</h2><p>A private Telegram digest, with WhatsApp for invited numbers.</p></div>
      </section>
    </main>
  );
}
