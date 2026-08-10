import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Logo } from '../../components/ui/logo'

export default function Terms() {
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

        <h1 className="text-3xl font-bold text-[#0f1729] mb-2">Terms of Service</h1>
        <p className="text-sm text-[#9aa3b2] mb-10">Last updated: August 2026</p>

        <div className="prose prose-sm max-w-none text-[#374151] space-y-8">

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">1. Acceptance of Terms</h2>
            <p className="leading-relaxed">
              By accessing or using ProqrIQ ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, you may not use the Service. These terms apply to all users, including engineers, administrators, CEOs, and any other individuals who access the platform under a paid or free subscription.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">2. Description of Service</h2>
            <p className="leading-relaxed">
              ProqrIQ is a B2B cost engineering and quotation platform for industrial manufacturers. The Service provides:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1.5">
              <li>AI-assisted part drawing analysis and structured cost breakdowns (individual, bulk up to 50 parts, and assembly BOM roll-up)</li>
              <li>Engineering knowledge-base queries over your internal PDF document library</li>
              <li>Supplier discovery, sourcing, and apple-to-apple negotiation comparison</li>
              <li>Quotation approval workflows with full audit trail</li>
              <li>Excel and PDF export of cost reports</li>
              <li>An AI-powered in-app assistant ("ProqrIQ Assistant") for guided help</li>
              <li>Regional rate configuration and AI model management for administrators</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">3. Subscription Plans and Billing</h2>
            <p className="leading-relaxed">
              ProqrIQ is offered under the following plans:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1.5">
              <li><strong>Free</strong> — limited access for evaluation purposes</li>
              <li><strong>Pro</strong> — unlimited quotes, bulk costing (up to 50 parts), assembly BOM, Excel/PDF export, supplier sourcing, and priority AI processing</li>
              <li><strong>Organization</strong> — everything in Pro, plus up to 25 team seats, knowledge base management, regional rates configuration, multi-provider AI routing, and full admin dashboard</li>
            </ul>
            <p className="leading-relaxed mt-3">
              Subscriptions are billed monthly or annually. Annual plans are charged as a single upfront payment. Payments are processed securely through Razorpay. By completing a purchase, you authorise us to charge the applicable fee to your chosen payment method. All fees are non-refundable except where required by applicable law. Plan changes take effect immediately; downgrades take effect at the end of the current billing cycle.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">4. Authorised Use</h2>
            <p className="leading-relaxed">
              Access to ProqrIQ is granted solely to authorised personnel within your organisation. You agree to:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1.5">
              <li>Use the Service only for legitimate business purposes</li>
              <li>Keep your login credentials and passkey confidential and not share them with unauthorised parties</li>
              <li>Notify your administrator immediately if you suspect unauthorised access to your account</li>
              <li>Comply with all applicable laws and regulations when using the Service</li>
              <li>Not attempt to reverse-engineer, scrape, or abuse the AI rate limits of the platform</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">5. AI-Generated Content</h2>
            <p className="leading-relaxed">
              The Service uses artificial intelligence — including the Anthropic Claude model and optionally other configured AI providers — to generate cost estimates, supplier suggestions, negotiation talking points, and in-app assistant responses. All AI-generated content is provided for informational purposes only and must be reviewed and validated by qualified engineers before use in commercial quotations or procurement decisions. ProqrIQ does not warrant the accuracy, completeness, or fitness for purpose of any AI-generated output. Cost estimates with a confidence score below 70% are withheld and replaced with clarification questions; you are responsible for providing complete and accurate input data to obtain reliable estimates.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">6. Intellectual Property</h2>
            <p className="leading-relaxed">
              All drawings, documents, and data you upload to the Service remain your property. By uploading content, you grant ProqrIQ a limited licence to process that content solely for the purpose of providing the Service to you. You represent that you have the right to upload and process any content you submit. The ProqrIQ software, interface, and brand are the intellectual property of their respective owners and may not be copied or redistributed without permission.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">7. Confidentiality</h2>
            <p className="leading-relaxed">
              The Service runs on-premise and processes your data locally by default. Any data transmitted to external AI providers (e.g. Anthropic) is governed by those providers' terms and data processing agreements. Payment data is transmitted to and processed by Razorpay in accordance with their PCI-DSS-compliant infrastructure; ProqrIQ does not store full card details. You are responsible for ensuring that data shared with external services complies with your organisation's confidentiality obligations.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">8. Approval Workflow and Audit</h2>
            <p className="leading-relaxed">
              ProqrIQ enforces a multi-role approval workflow: submitted quotations require CEO-level approval before they are locked. All create, update, approve, reject, and delete operations are permanently recorded in an audit log and cannot be altered retroactively. Soft deletion is used for quotation and batch records — data is never permanently erased and remains available for audit and compliance review.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">9. Limitation of Liability</h2>
            <p className="leading-relaxed">
              To the fullest extent permitted by applicable law, ProqrIQ and its affiliates shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of or related to your use of the Service, including but not limited to errors in cost estimates, supplier recommendations, quotation outputs, or billing issues arising from third-party payment processors.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">10. Modifications</h2>
            <p className="leading-relaxed">
              We reserve the right to modify these Terms at any time. Material changes will be communicated through the Service. Continued use of the Service after changes take effect constitutes acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">11. Governing Law</h2>
            <p className="leading-relaxed">
              These Terms shall be governed by and construed in accordance with applicable laws. Any disputes arising under these Terms shall be resolved through good-faith negotiation between the parties.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">12. Contact</h2>
            <p className="leading-relaxed">
              If you have questions about these Terms, please contact your system administrator or the platform owner. You can also reach us through the in-app Help Assistant.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-[#e5e8ef] flex items-center justify-between text-xs text-[#9aa3b2]">
          <span>© {new Date().getFullYear()} ProqrIQ. All rights reserved.</span>
          <Link to="/privacy" className="hover:text-[#0f1729] transition-colors">Privacy Policy</Link>
        </div>
      </div>
    </div>
  )
}
