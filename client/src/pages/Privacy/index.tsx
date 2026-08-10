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
        <p className="text-sm text-[#9aa3b2] mb-10">Last updated: August 2026</p>

        <div className="prose prose-sm max-w-none text-[#374151] space-y-8">

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">1. Introduction</h2>
            <p className="leading-relaxed">
              This Privacy Policy explains how ProqrIQ ("we", "the Service") collects, uses, stores, and protects information when you use our cost engineering and quotation platform. We are committed to handling your data responsibly and in compliance with applicable privacy laws.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">2. Information We Collect</h2>
            <p className="leading-relaxed">We collect the following categories of information:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1.5">
              <li><strong>Account information</strong> — full name, email address, and hashed password when you register</li>
              <li><strong>Authentication data</strong> — passkey (WebAuthn) credentials stored locally on your device; no biometric data is transmitted to our servers</li>
              <li><strong>Session data</strong> — JWT tokens stored in your browser's local storage for authentication</li>
              <li><strong>Usage and audit data</strong> — every action taken within the platform (quotation created, batch started, part costed, supplier quote uploaded, approval granted, etc.) is recorded in an immutable audit log for compliance purposes</li>
              <li><strong>Uploaded content</strong> — part drawings, PDF engineering documents, and other files you upload for analysis or knowledge-base ingestion</li>
              <li><strong>AI chat history</strong> — messages sent to and received from the in-app ProqrIQ Assistant are processed in real time and are not persistently stored beyond your current session</li>
              <li><strong>Billing information</strong> — subscription plan, billing cycle, and payment verification tokens; full card details are never stored by ProqrIQ and are handled exclusively by Razorpay</li>
              <li><strong>Notification preferences</strong> — in-app notification read status for quote approvals, batch completions, and system alerts</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">3. How We Use Your Information</h2>
            <p className="leading-relaxed">We use collected information to:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1.5">
              <li>Authenticate your identity and maintain your session securely</li>
              <li>Process part drawings and generate structured cost estimates using AI</li>
              <li>Search the engineering knowledge base on your behalf before every AI estimate</li>
              <li>Run bulk and assembly costing workflows in parallel</li>
              <li>Facilitate supplier sourcing, quote extraction, comparison, and negotiation report generation</li>
              <li>Maintain a complete, tamper-evident audit trail of all quotation and approval activity</li>
              <li>Provide usage analytics and AI budget monitoring to administrators</li>
              <li>Process subscription payments and verify payment status through Razorpay</li>
              <li>Send in-app notifications for quote submissions, approvals, rejections, and batch completions</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">4. Data Storage</h2>
            <p className="leading-relaxed">
              ProqrIQ is designed to run on-premise. All operational data — including the SQLite database, uploaded files, and vector embeddings — is stored on your organisation's own server infrastructure. We do not operate a central cloud database that holds your quotation or drawing data. Quotation and batch records are soft-deleted and are never permanently erased, preserving complete history for audit purposes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">5. Third-Party AI Providers</h2>
            <p className="leading-relaxed">
              When you use AI-powered features — including cost estimation, supplier suggestions, knowledge-base queries, document analysis, and the in-app Help Assistant — excerpts from your drawings and engineering documents are transmitted to external AI providers. By default, only <strong>Anthropic (Claude)</strong> is used. Administrators may additionally enable OpenAI, Google Gemini, xAI Grok, or Azure OpenAI through the AI Control panel. You should review the applicable privacy and data processing policies of any enabled provider. ProqrIQ does not store the content of AI model requests or responses on external servers; data handling is governed solely by each provider's terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">6. Payment Data and Razorpay</h2>
            <p className="leading-relaxed">
              Subscription payments are processed by <strong>Razorpay</strong>, a PCI-DSS-compliant payment gateway. ProqrIQ does not receive, store, or process full card or bank account details. We receive only payment verification tokens and order status information from Razorpay. By completing a payment, you agree to Razorpay's Privacy Policy and Terms of Use in addition to this Policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">7. Supplier Lookup</h2>
            <p className="leading-relaxed">
              Supplier discovery is AI-powered by default (using only the configured AI provider). An optional external supplier-directory lookup is available but is <strong>disabled by default</strong> and requires explicit administrator configuration via an allow-list of approved hosts. When enabled, part specification queries may be transmitted to the configured supplier directory endpoint. External supplier hits are cached separately and must be manually promoted before entering your supplier database.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">8. Data Security</h2>
            <p className="leading-relaxed">
              We implement appropriate technical and organisational measures to protect your data, including:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1.5">
              <li>Passwords hashed using bcrypt before storage — plaintext passwords are never stored</li>
              <li>All API routes protected by JWT authentication and role-based access control</li>
              <li>Passkey (WebAuthn) support for phishing-resistant, passwordless authentication</li>
              <li>All create, update, delete, approve, and reject operations recorded in an immutable audit log</li>
              <li>The Anthropic API key and other secrets are server-side only and are never exposed to the browser</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">9. Data Retention</h2>
            <p className="leading-relaxed">
              Quotations, batch records, assemblies, and supplier quotes are soft-deleted (never permanently removed) to preserve audit history. Uploaded files and database records are retained for as long as required by your organisation's retention policy. Administrators may manage user accounts and data through the Account Management section. AI chat messages in the Help Assistant are session-only and are not retained after you close the panel.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">10. Your Rights</h2>
            <p className="leading-relaxed">
              Depending on your jurisdiction, you may have rights to access, correct, or request deletion of your personal data. Please contact your system administrator to exercise these rights. Administrators can view and manage user accounts through the Admin section of the platform.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">11. Changes to This Policy</h2>
            <p className="leading-relaxed">
              We may update this Privacy Policy from time to time to reflect new features or legal requirements. Material changes will be communicated through the Service. Your continued use of the Service after changes take effect constitutes acceptance of the revised policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">12. Contact</h2>
            <p className="leading-relaxed">
              If you have questions or concerns about this Privacy Policy or how your data is handled, please contact your system administrator or the platform owner. You can also use the in-app Help Assistant for general guidance.
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
