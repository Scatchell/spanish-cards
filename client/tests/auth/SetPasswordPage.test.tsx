// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../src/api.js';
import { SetPasswordPage } from '../../src/auth/SetPasswordPage.js';

afterEach(cleanup);

vi.mock('../../src/api.js', async () => {
  const actual = await vi.importActual<typeof api>('../../src/api.js');
  return { ...actual, checkSetPasswordToken: vi.fn(), setPassword: vi.fn() };
});
const mockedCheck = api.checkSetPasswordToken as unknown as ReturnType<typeof vi.fn>;
const mockedSet = api.setPassword as unknown as ReturnType<typeof vi.fn>;

function renderAt(url: string, onLogin = vi.fn()) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/set-password" element={<SetPasswordPage onLogin={onLogin} />} />
        <Route path="/" element={<p>home</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return onLogin;
}

describe('SetPasswordPage', () => {
  it('shows the email for a valid link, then sets the password and goes home', async () => {
    mockedCheck.mockResolvedValue({ email: 'new@example.com' });
    mockedSet.mockResolvedValue({ ok: true });
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const onLogin = renderAt('/set-password?token=abc');
    expect(await screen.findByText(/new@example\.com/)).toBeInTheDocument();
    expect(replaceState).toHaveBeenCalledWith(null, '', '/set-password');
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'long-enough-1' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'long-enough-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set password' }));
    await waitFor(() => expect(mockedSet).toHaveBeenCalledWith('abc', 'long-enough-1'));
    expect(onLogin).toHaveBeenCalled();
    expect(await screen.findByText('home')).toBeInTheDocument();
  });

  it('blocks mismatched confirmation without calling the server', async () => {
    mockedCheck.mockResolvedValue({ email: 'new@example.com' });
    mockedSet.mockClear();
    renderAt('/set-password?token=abc');
    await screen.findByText(/new@example\.com/);
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'long-enough-1' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'long-enough-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Passwords do not match');
    expect(mockedSet).not.toHaveBeenCalled();
  });

  it('explains an invalid or expired link, including a missing token', async () => {
    mockedCheck.mockRejectedValue(new api.ApiError(404, 'This link is invalid or has expired'));
    renderAt('/set-password?token=bad');
    expect(await screen.findByText(/invalid or has expired/)).toBeInTheDocument();
    cleanup();
    renderAt('/set-password');
    expect(await screen.findByText(/invalid or has expired/)).toBeInTheDocument();
  });
});
