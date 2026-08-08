import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Logo } from '../../components/ui/logo'

export default function Privacy() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-10">
          <Logo size="sm" />
          <Link to="/login" className="flex items-center gap-1.5 text-sm text-[#9aa3b2] hover:text-[#0f1729] transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Back to sign in
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-[#0f1729] mb-2">Privacy Policy</h1>
        <p className="text-sm text-[#9aa3b2] mb-10">Last updated: June 2025</p>

        <div className="prose prose-sm max-w-none text-[#374151] space-y-8">

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">1. Introduction</h2>
            <p className="leading-relaxed">
              This Privacy Policy explains how ProqrIQ ("we", "the Service") collects, uses, and protects information when you use our cost engineering and quotation platform. We are committed to handling your data responsibly and in compliance with applicable privacy laws.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">2. Information We Collect</h2>
            <p className="leading-relaxed">We collect the following categories of information:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1.5">
              <li><strong>Account information</strong> — name, email address, and hashed password when you register</li>
              <li><strong>Usage data</strong> — actions taken within the platform, including quotations created, batches run, and AI queries made, stored in audit logs for compliance purposes</li>
              <li><strong>Uploaded content</strong> — part drawings, PDF documents, and other files you upload for analysis</li>
              <li><strong>Authentication data</strong> — passkey credentials (stored locally; no biometric data is transmitted)</li>
              <li><strong>Session data</strong> — JWT tokens stored in your browser's local storage for authentication</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">3. How We Use Your Information</h2>
            <p className="leading-relaxed">We use collected information to:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1.5">
              <li>Authenticate your identity and maintain your session</li>
              <li>Process part drawings and generate cost estimates using AI</li>
              <li>Search the engineering knowledge base on your behalf</li>
              <li>Maintain a complete audit trail of all quotation activity for compliance</li>
              <li>Provide usage analytics to administrators for budget and AI cost management</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">4. Data Storage</h2>
            <p className="leading-relaxed">
              ProqrIQ is designed to run on-premise. All data — including the SQLite database, uploaded files, and embeddings — is stored on your organisation's own infrastructure. We do not operate a central cloud database that stores your quotation data.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">5. Third-Party AI Providers</h2>
            <p className="leading-relaxed">
              When you use AI-powered features (cost estimation, supplier suggestions, document analysis), content from your drawings and knowledge base may be transmitted to third-party AI providers, including Anthropic (Claude). This transmission is necessary to provide the AI analysis features. You should review the privacy policies of any configured AI providers. By default, only Anthropic is used; additional providers (OpenAI, Google Gemini, xAI Grok, Azure OpenAI) may be enabled by your administrator.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">6. Data Retention</h2>
            <p className="leading-relaxed">
              Quotations and batch records are soft-deleted (never permanently removed) to preserve audit history. Uploaded files and database records are retained for as long as required by your organisation's retention policy. Administrators may manage data retention through the platform settings.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">7. Data Security</h2>
            <p className="leading-relaxed">
              We implement appropriate technical and organisational measures to protect your data, including:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1.5">
              <li>Passwords hashed using bcrypt before storage</li>
              <li>All API routes protected by JWT authentication and role-based access control</li>
              <li>Passkey (WebAuthn) support for phishing-resistant authentication</li>
              <li>All mutations recorded in an immutable audit log</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">8. Your Rights</h2>
            <p className="leading-relaxed">
              Depending on your jurisdiction, you may have rights to access, correct, or request deletion of your personal data. Please contact your system administrator to exercise these rights. Administrators can view and manage user accounts through the Account Management section.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">9. Changes to This Policy</h2>
            <p className="leading-relaxed">
              We may update this Privacy Policy from time to time. Material changes will be communicated through the Service. Your continued use of the Service after changes take effect constitutes acceptance of the revised policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">10. Contact</h2>
            <p className="leading-relaxed">
              If you have questions or concerns about this Privacy Policy or how your data is handled, please contact your system administrator or the platform owner.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-[#e5e8ef] flex items-center justify-between text-xs text-[#9aa3b2]">
          <span>© {new Date().getFullYear()} ProqrIQ. All rights reserved.</span>
          <Link to="/terms" className="hover:text-[#0f1729] transition-colors">Terms of Service</Link>
        </div>
      </div>
    </div>
  )
}
