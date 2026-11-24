import React, { useState } from 'react';

const editions = [
  { name: 'Morning', time: '08:00', title: 'The morning brief', detail: 'Up to five stories from the past 24 hours, ranked against your interests.' },
  { name: 'Evening', time: '18:00', title: 'The evening update', detail: 'Fresh coverage since the morning run, filtered through the same interest profile.' },
];

export default function EditionPreview() {
  const [selected, setSelected] = useState(0);
  const edition = editions[selected];
  return (
    <section className="edition" aria-label="Digest schedule preview">
      <div className="edition-bar"><span>Edition preview</span><span>IST</span></div>
      <div className="edition-switch">{editions.map((item, index) => (
        <button key={item.name} aria-pressed={selected === index} onClick={() => setSelected(index)}>{item.name}</button>
      ))}</div>
      <div key={selected} className="edition-body" aria-live="polite">
        <div className="edition-time">{edition.time}</div>
        <h2>{edition.title}</h2><p>{edition.detail}</p>
      </div>
    </section>
  );
}
