// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../src/api.js';
import { AccountPage } from '../../src/auth/AccountPage.js';

afterEach(cleanup);
vi.mock('../../src/api.js', async () => {
  const actual = await vi.importActual<typeof api>('../../src/api.js');
  return { ...actual, getMe: vi.fn(), changePassword: vi.fn(), logout: vi.fn() };
});
const mockedMe = api.getMe as unknown as ReturnType<typeof vi.fn>;
const mockedChange = api.changePassword as unknown as ReturnType<typeof vi.fn>;

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('AccountPage', () => {
  it('shows the signed-in email and changes the password', async () => {
    mockedMe.mockResolvedValue({ email: 'me@example.com' });
    mockedChange.mockResolvedValue({ ok: true });
    render(<MemoryRouter><AccountPage onLoggedOut={vi.fn()} /></MemoryRouter>);
    expect(await screen.findByText('me@example.com')).toBeInTheDocument();
    fill('Current password', 'old-password');
    fill('New password', 'new-password-1');
    fill('Confirm new password', 'new-password-1');
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    await waitFor(() => expect(mockedChange).toHaveBeenCalledWith('old-password', 'new-password-1'));
    expect(await screen.findByRole('status')).toHaveTextContent('Password changed');
  });

  it('shows the server error for a wrong current password', async () => {
    mockedMe.mockResolvedValue({ email: 'me@example.com' });
    mockedChange.mockRejectedValue(new api.ApiError(400, 'Current password is incorrect'));
    render(<MemoryRouter><AccountPage onLoggedOut={vi.fn()} /></MemoryRouter>);
    await screen.findByText('me@example.com');
    fill('Current password', 'wrong');
    fill('New password', 'new-password-1');
    fill('Confirm new password', 'new-password-1');
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Current password is incorrect');
  });
});
