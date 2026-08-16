import { PRIVACY_DOC } from '@/legal/legal-docs';
import LegalDocPage from './LegalDocPage';

export default function PrivacyPolicyPage() {
  return <LegalDocPage doc={PRIVACY_DOC} />;
}