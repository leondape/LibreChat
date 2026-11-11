import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { isSurveyCompanyLeafPath } from 'librechat-data-provider';
import { flight } from 'test/survey';
import Company from '../Company';

function Harness({ initial = [] as string[] }) {
  const [path, setPath] = useState(initial);
  return (
    <>
      <Company tree={flight.companies} value={path} onChange={setPath} labelledBy="label" />
      <output data-testid="path">{path.join('/')}</output>
      <output data-testid="leaf">{String(isSurveyCompanyLeafPath(flight.companies, path))}</output>
    </>
  );
}

beforeAll(() => {
  /** Radix Select needs these pointer and scroll APIs, which jsdom lacks. */
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
});

describe('Company', () => {
  it('adds one select per level until a leaf is reached', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getAllByRole('combobox')).toHaveLength(1);

    await user.click(screen.getByRole('combobox', { name: 'Company level 1' }));
    await user.click(await screen.findByRole('option', { name: 'Group' }));
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
    expect(screen.getByTestId('leaf')).toHaveTextContent('false');

    await user.click(screen.getByRole('combobox', { name: 'Company level 2' }));
    await user.click(await screen.findByRole('option', { name: 'Studio' }));
    expect(screen.getAllByRole('combobox')).toHaveLength(3);

    await user.click(screen.getByRole('combobox', { name: 'Company level 3' }));
    await user.click(await screen.findByRole('option', { name: 'Drama' }));

    expect(screen.getByTestId('path')).toHaveTextContent('group/studio/drama');
    expect(screen.getByTestId('leaf')).toHaveTextContent('true');
    expect(screen.getAllByRole('combobox')).toHaveLength(3);
  });

  it('clears the levels below when a parent changes', async () => {
    const user = userEvent.setup();
    render(<Harness initial={['group', 'studio', 'drama']} />);

    await user.click(screen.getByRole('combobox', { name: 'Company level 2' }));
    await user.click(await screen.findByRole('option', { name: 'News' }));

    expect(screen.getByTestId('path')).toHaveTextContent('group/news');
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
    expect(screen.getByTestId('leaf')).toHaveTextContent('true');
  });
});
