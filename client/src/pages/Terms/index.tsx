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
        <p className="text-sm text-[#9aa3b2] mb-10">Last updated: June 2025</p>

        <div className="prose prose-sm max-w-none text-[#374151] space-y-8">

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">1. Acceptance of Terms</h2>
            <p className="leading-relaxed">
              By accessing or using ProqrIQ ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, you may not use the Service. These terms apply to all users, including engineers, administrators, and any other individuals who access the platform.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">2. Description of Service</h2>
            <p className="leading-relaxed">
              ProqrIQ is a B2B cost engineering and quotation platform designed for internal use within your organisation. The Service provides AI-assisted part drawing analysis, knowledge-base queries, cost breakdowns, supplier sourcing, and quotation management functionality.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">3. Authorised Use</h2>
            <p className="leading-relaxed">
              Access to ProqrIQ is granted solely to authorised personnel within your organisation. You agree to:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1.5">
              <li>Use the Service only for legitimate business purposes</li>
              <li>Keep your login credentials confidential and not share them with unauthorised parties</li>
              <li>Notify your administrator immediately if you suspect unauthorised access to your account</li>
              <li>Comply with all applicable laws and regulations when using the Service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">4. AI-Generated Content</h2>
            <p className="leading-relaxed">
              The Service uses artificial intelligence to generate cost estimates, supplier suggestions, and analysis outputs. All AI-generated content is provided for informational purposes only and should be reviewed and validated by qualified engineers before use in commercial quotations or procurement decisions. ProqrIQ does not warrant the accuracy, completeness, or fitness for purpose of any AI-generated output.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">5. Intellectual Property</h2>
            <p className="leading-relaxed">
              All drawings, documents, and data you upload to the Service remain your property. By uploading content, you grant ProqrIQ a limited licence to process that content solely for the purpose of providing the Service to you. You represent that you have the right to upload and process any content you submit.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">6. Confidentiality</h2>
            <p className="leading-relaxed">
              The Service runs on-premise and processes your data locally by default. Any data transmitted to external AI providers (e.g. Anthropic) is governed by those providers' terms and data processing agreements. You are responsible for ensuring that data shared with external services complies with your organisation's confidentiality obligations.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">7. Limitation of Liability</h2>
            <p className="leading-relaxed">
              To the fullest extent permitted by applicable law, ProqrIQ and its affiliates shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of or related to your use of the Service, including but not limited to errors in cost estimates, supplier recommendations, or quotation outputs.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">8. Modifications</h2>
            <p className="leading-relaxed">
              We reserve the right to modify these Terms at any time. Material changes will be communicated through the Service. Continued use of the Service after changes take effect constitutes acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">9. Governing Law</h2>
            <p className="leading-relaxed">
              These Terms shall be governed by and construed in accordance with applicable laws. Any disputes arising under these Terms shall be resolved through good-faith negotiation between the parties.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#0f1729] mb-3">10. Contact</h2>
            <p className="leading-relaxed">
              If you have questions about these Terms, please contact your system administrator or the platform owner.
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
