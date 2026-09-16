// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditableAnswerGroup } from '../../src/cards/EditableAnswerGroup.js';

afterEach(cleanup);

function renderGroup(overrides: Partial<Parameters<typeof EditableAnswerGroup>[0]> = {}) {
  const props = {
    primaryText: 'car',
    ariaLabel: 'English answer',
    onSavePrimary: vi.fn().mockResolvedValue(undefined),
    alternates: [],
    onAddAlternate: vi.fn().mockResolvedValue({ id: 1, text: 'automobile' }),
    onUpdateAlternate: vi.fn().mockResolvedValue(undefined),
    onDeleteAlternate: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<EditableAnswerGroup {...props} />);
  return props;
}

describe('EditableAnswerGroup', () => {
  it('shows the primary text in view mode with no alternates visible', () => {
    renderGroup({ alternates: [{ id: 1, text: 'automobile' }] });
    expect(screen.getByText('car')).toBeTruthy();
    expect(screen.queryByText('automobile')).toBeNull();
  });

  it('expands into edit mode showing primary and alternate inputs', () => {
    renderGroup({ alternates: [{ id: 1, text: 'automobile' }] });
    fireEvent.click(screen.getByLabelText('Edit English answer'));
    expect(screen.getByText('Primary answer')).toBeTruthy();
    expect(screen.getByText('Alternative answers')).toBeTruthy();
    expect((screen.getByDisplayValue('automobile') as HTMLInputElement).value).toBe('automobile');
  });

  it('saves an edited alternate on blur', async () => {
    const props = renderGroup({ alternates: [{ id: 1, text: 'automobile' }] });
    fireEvent.click(screen.getByLabelText('Edit English answer'));
    const input = screen.getByDisplayValue('automobile');
    fireEvent.change(input, { target: { value: 'auto' } });
    fireEvent.blur(input);
    await waitFor(() => expect(props.onUpdateAlternate).toHaveBeenCalledWith(1, 'auto'));
  });

  it('deletes an alternate', async () => {
    const props = renderGroup({ alternates: [{ id: 1, text: 'automobile' }] });
    fireEvent.click(screen.getByLabelText('Edit English answer'));
    fireEvent.click(screen.getByLabelText('Delete alternate answer'));
    expect(props.onDeleteAlternate).toHaveBeenCalledWith(1);
  });

  it('adds a new alternate by typing into the "+ Add alternative" row', async () => {
    const props = renderGroup({ alternates: [] });
    fireEvent.click(screen.getByLabelText('Edit English answer'));
    fireEvent.click(screen.getByText('+ Add alternative'));
    const input = screen.getByLabelText('Alternate answer');
    fireEvent.change(input, { target: { value: 'automobile' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(props.onAddAlternate).toHaveBeenCalledWith('automobile'));
  });

  it('hides "+ Add alternative" once 5 alternates exist', () => {
    renderGroup({
      alternates: Array.from({ length: 5 }, (_, i) => ({ id: i + 1, text: `alt${i}` })),
    });
    fireEvent.click(screen.getByLabelText('Edit English answer'));
    expect(screen.queryByText('+ Add alternative')).toBeNull();
  });

  it('saves the primary answer via the existing EditableSentence pattern', async () => {
    const props = renderGroup();
    fireEvent.click(screen.getByLabelText('Edit English answer'));
    const inputs = screen.getAllByRole('textbox');
    const primaryInput = inputs.find((i) => (i as HTMLInputElement).value === 'car') as HTMLInputElement;
    fireEvent.change(primaryInput, { target: { value: 'automobile' } });
    fireEvent.keyDown(primaryInput, { key: 'Enter' });
    await waitFor(() => expect(props.onSavePrimary).toHaveBeenCalledWith('automobile'));
  });
});
