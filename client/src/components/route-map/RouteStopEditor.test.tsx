// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RouteSegment, RouteStop } from './routeMapTypes';
import { RouteStopEditor } from './RouteStopEditor';

const stops: RouteStop[] = [
  {
    id: 'alpha/1',
    name: 'Alpha',
    lat: 95,
    lng: -181,
    label: 'First stop',
    labelPosition: 'left',
  },
  {
    id: 'beta',
    name: 'Beta',
    lat: 48.8566,
    lng: 2.3522,
    labelPosition: 'auto',
  },
];

const segments: RouteSegment[] = [
  {
    id: 'alpha-beta',
    fromStopId: 'alpha/1',
    toStopId: 'beta',
    mode: 'rail',
    curve: 0.25,
  },
];

function renderEditor(overrides: { stops?: RouteStop[]; segments?: RouteSegment[] } = {}) {
  document.body.innerHTML = renderToStaticMarkup(
    <RouteStopEditor
      stops={overrides.stops ?? stops}
      segments={overrides.segments ?? segments}
      arrivalMode="flight"
      departureMode="none"
      countryName="Example"
      onChange={vi.fn()}
      onArrivalModeChange={vi.fn()}
      onDepartureModeChange={vi.fn()}
    />,
  );
}

describe('RouteStopEditor accessibility', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('gives every stop field a persistent, stop-specific accessible name', () => {
    renderEditor();

    expect(document.querySelector('[aria-label="Location name for stop 1, Alpha"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Latitude for stop 1, Alpha"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Longitude for stop 1, Alpha"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Custom label for stop 1, Alpha"]')).not.toBeNull();
    expect(
      document.querySelector('[aria-label="Label position for stop 1, Alpha"]'),
    ).not.toBeNull();
  });

  it('associates invalid coordinates with stable error messages', () => {
    renderEditor();

    const latitude = document.querySelector<HTMLInputElement>(
      '[aria-label="Latitude for stop 1, Alpha"]',
    );
    const longitude = document.querySelector<HTMLInputElement>(
      '[aria-label="Longitude for stop 1, Alpha"]',
    );

    expect(latitude?.getAttribute('aria-invalid')).toBe('true');
    expect(latitude?.getAttribute('aria-describedby')).toBe('route-stop-alpha-1-latitude-error');
    expect(document.getElementById('route-stop-alpha-1-latitude-error')?.textContent).toContain(
      '-90 and 90',
    );

    expect(longitude?.getAttribute('aria-invalid')).toBe('true');
    expect(longitude?.getAttribute('aria-describedby')).toBe('route-stop-alpha-1-longitude-error');
    expect(document.getElementById('route-stop-alpha-1-longitude-error')?.textContent).toContain(
      '-180 and 180',
    );

    const validLatitude = document.querySelector<HTMLInputElement>(
      '[aria-label="Latitude for stop 2, Beta"]',
    );
    expect(validLatitude?.getAttribute('aria-invalid')).toBe('false');
    expect(validLatitude?.hasAttribute('aria-describedby')).toBe(false);
  });

  it('identifies stop actions and route controls without visual context', () => {
    renderEditor();

    expect(
      document.querySelector<HTMLButtonElement>('[aria-label="Move stop 1, Alpha up"]')?.disabled,
    ).toBe(true);
    expect(document.querySelector('[aria-label="Move stop 1, Alpha down"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Remove stop 1, Alpha"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="rail route from Alpha to Beta"]')).not.toBeNull();

    const curve = document.querySelector<HTMLInputElement>(
      '[aria-label="Curve for route from Alpha to Beta"]',
    );
    expect(curve?.getAttribute('aria-valuetext')).toBe('25 percent right curve');
  });

  it('announces a zero curve as straight', () => {
    renderEditor({ segments: [{ ...segments[0], curve: 0 }] });

    expect(
      document
        .querySelector('[aria-label="Curve for route from Alpha to Beta"]')
        ?.getAttribute('aria-valuetext'),
    ).toBe('Straight');
  });
});
