// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditableSentence } from '../../src/cards/EditableSentence.js';

afterEach(cleanup);

function renderSentence(onSave: (text: string) => Promise<void>) {
  render(<EditableSentence text="hola" onSave={onSave} ariaLabel="Spanish prompt" />);
  fireEvent.click(screen.getByLabelText('Edit Spanish prompt'));
  return screen.getByLabelText('Edit Spanish prompt') as HTMLInputElement;
}

describe('EditableSentence', () => {
  it('saves the trimmed value on Enter and exits edit mode', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const input = renderSentence(onSave);
    fireEvent.change(input, { target: { value: '  adiós  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('adiós'));
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
  });

  it('saves on blur as well as Enter', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const input = renderSentence(onSave);
    fireEvent.change(input, { target: { value: 'adiós' } });
    fireEvent.blur(input);
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('adiós'));
  });

  it('cancels on Escape without calling onSave', () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const input = renderSentence(onSave);
    fireEvent.change(input, { target: { value: 'adiós' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByLabelText('Edit Spanish prompt')).toBeTruthy();
  });

  it('does not call onSave for an unchanged or empty value', () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const input = renderSentence(onSave);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('reverts and shows an error when onSave rejects', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('nope'));
    const input = renderSentence(onSave);
    fireEvent.change(input, { target: { value: 'adiós' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(screen.getByText('Could not save — reverted.')).toBeTruthy());
    // Stays in edit mode so the user can retry, with the value reverted.
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('hola');
  });
});
