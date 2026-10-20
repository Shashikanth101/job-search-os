import { useClipboardCopy } from '../../hooks/useClipboardCopy';
import { useManualLinks } from '../../hooks/useManualLinks';
import { useOutreach } from '../../hooks/useOutreach';
import { useUncoveredCompanies } from '../../hooks/useUncoveredCompanies';
import { ManualLinksList } from '../applications/ManualLinksList';
import { UncoveredCompaniesSection } from '../applications/UncoveredCompaniesSection';
import { ErrorBanner } from '../ui/ErrorBanner';
import { MessageTemplatesSection } from './MessageTemplatesSection';
import { OutreachSection } from './OutreachSection';

/** Outreach page (/outreach): LinkedIn search links, message templates, and the manual career-page and uncovered-company lists. */
export function OutreachPage() {
  const { linkedinOutreach, messageTemplates, loading, error } = useOutreach();
  const { manualLinks, error: linksError } = useManualLinks();
  const { uncoveredCompanies, error: uncoveredError } = useUncoveredCompanies();
  const { copiedKey, copy, error: clipboardError } = useClipboardCopy();
  return (
    <main className="mx-auto max-w-5xl p-4 lg:p-6">
      <h1 className="mb-4 text-lg font-bold text-slate-900">Outreach</h1>
      <ErrorBanner message={error || linksError || uncoveredError || clipboardError} />
      {loading ? <p className="text-sm text-slate-500">Loading...</p> : (
        <>
          <OutreachSection entries={linkedinOutreach} />
          <MessageTemplatesSection templates={messageTemplates} copiedKey={copiedKey} onCopy={copy} />
          <ManualLinksList links={manualLinks} />
          <UncoveredCompaniesSection companies={uncoveredCompanies} />
        </>
      )}
    </main>
  );
}
