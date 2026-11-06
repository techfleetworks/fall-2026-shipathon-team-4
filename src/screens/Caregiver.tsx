import { Link } from 'react-router-dom';
import { Shell } from '../components/Shell';

/** Caregiver flow is out of MVP scope. This page explains and offers a path forward. */
export function Caregiver() {
  return (
    <Shell header={{ kind: 'sub', title: 'Supporting someone', back: 'history', right: <span /> }}>
      <h1>Thank you for showing up for someone.</h1>
      <p className="lead">
        A caregiver space is coming. It will let the person you support choose what you can see, add your own observations,
        and help prepare for visits together — always with their consent.
      </p>
      <div className="card card--muted">
        <h3>For now, you can</h3>
        <ul className="list">
          <li>Sit with them while they use Get Heard on their own device</li>
          <li>Help them tell their story in their own words</li>
          <li>Look through scripts together before a visit</li>
        </ul>
      </div>
      <Link className="btn btn--primary btn--block" to="/scripts">Browse scripts</Link>
      <Link className="btn btn--block" to="/">Back to start</Link>
    </Shell>
  );
}
