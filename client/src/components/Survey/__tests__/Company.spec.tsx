import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen, within } from '@testing-library/react';
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

const breadcrumb = () => screen.getByRole('navigation', { name: 'Where you work' });

describe('Company', () => {
  it('drills from the root to a leaf and keeps that leaf selected', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Group' }));
    expect(screen.getByTestId('path')).toHaveTextContent('group');
    expect(screen.getByTestId('leaf')).toHaveTextContent('false');

    await user.click(screen.getByRole('button', { name: 'Studio' }));
    await user.click(screen.getByRole('button', { name: 'Drama' }));

    expect(screen.getByTestId('path')).toHaveTextContent('group/studio/drama');
    expect(screen.getByTestId('leaf')).toHaveTextContent('true');
    expect(screen.getByRole('button', { name: 'Drama', pressed: true })).toBeInTheDocument();
  });

  it('shows the branches in the breadcrumb, never the chosen leaf', () => {
    render(<Harness initial={['group', 'studio', 'drama']} />);

    const trail = breadcrumb();
    expect(within(trail).getByRole('button', { name: 'All companies' })).toBeInTheDocument();
    expect(within(trail).getByRole('button', { name: 'Group' })).toBeInTheDocument();
    expect(within(trail).getByText('Studio')).toHaveAttribute('aria-current', 'location');
    expect(within(trail).queryByText('Drama')).not.toBeInTheDocument();
  });

  it('marks branches and leaves differently before anything is chosen', () => {
    render(<Harness initial={['group']} />);

    expect(screen.getByRole('button', { name: 'News', pressed: false })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Studio' })).not.toHaveAttribute('aria-pressed');
  });

  it('returns to a branch from the breadcrumb and can pick another leaf', async () => {
    const user = userEvent.setup();
    render(<Harness initial={['group', 'studio', 'drama']} />);

    await user.click(within(breadcrumb()).getByRole('button', { name: 'Group' }));
    expect(screen.getByTestId('path')).toHaveTextContent('group');
    expect(screen.getByTestId('leaf')).toHaveTextContent('false');

    await user.click(screen.getByRole('button', { name: 'News' }));
    expect(screen.getByTestId('path')).toHaveTextContent('group/news');
    expect(screen.getByTestId('leaf')).toHaveTextContent('true');
  });

  it('goes back to the top level from the breadcrumb', async () => {
    const user = userEvent.setup();
    render(<Harness initial={['group', 'news']} />);

    await user.click(within(breadcrumb()).getByRole('button', { name: 'All companies' }));
    expect(screen.getByTestId('path')).toBeEmptyDOMElement();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Group' })).toBeInTheDocument();
  });
});
