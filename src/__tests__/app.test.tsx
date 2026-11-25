import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';
import { setupServer } from 'msw/node';
import { handlers } from '../mocks/handlers';
import { beforeAll, afterAll, beforeEach } from 'vitest';

const server = setupServer(...handlers);
beforeAll(() => server.listen());
afterAll(() => server.close());
beforeEach(() => { localStorage.clear(); server.resetHandlers(); });

describe('App smoke', () => {
  it('loads the menu from the mock API and shows groups and stock hints', async () => {
    render(<App />);
    expect(await screen.findByText('Build Your Breakfast - Smart Order Builder')).toBeInTheDocument();
    expect(await screen.findByText(/Croissant/)).toBeInTheDocument();
    expect((await screen.findAllByText(/more can be added/)).length).toBeGreaterThan(0);
  });
});
