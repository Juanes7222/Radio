import { TERMS_DOC } from '@/legal/legal-docs';
import LegalDocPage from './LegalDocPage';

export default function TermsPage() {
  return <LegalDocPage doc={TERMS_DOC} />;
}