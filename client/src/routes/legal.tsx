import { Link, useParams } from 'react-router';

const documents: Record<string, { title: string; sections: Array<[string, string]> }> = {
  terms: {
    title: 'Terms of Service',
    sections: [
      [
        'Service',
        'MooNsConfig provides subscription software for travel companies. Each company is responsible for its users, customer records, travel services, and lawful use of the platform.',
      ],
      [
        'Trials and billing',
        'The no-card Enterprise trial runs for seven consecutive days after provisioning. Paid prices exclude applicable GST. Renewals, cancellations, refunds, and plan changes follow the order form and published billing policy.',
      ],
      [
        'Customer data',
        'The company retains ownership of its customer data. MooNsConfig processes that data only to provide, secure, support, and improve the contracted service.',
      ],
      [
        'Suspension and deletion',
        'Expired or unpaid workspaces are restricted immediately. Data is retained for 90 days unless law or a written agreement requires otherwise, after which deletion is scheduled and backups age out.',
      ],
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    sections: [
      [
        'Information collected',
        'We collect account, company, billing, security, support, usage, and device information needed to operate MooNsConfig. Travel companies independently control the traveler data they enter.',
      ],
      [
        'Purposes',
        'We use information for account administration, service delivery, security, billing, support, compliance, and consented communications. We do not sell personal data.',
      ],
      [
        'Rights and contact',
        'People may request access, correction, export, or deletion through their company administrator or MooNsConfig support, subject to legal retention obligations.',
      ],
    ],
  },
  'acceptable-use': {
    title: 'Acceptable Use Policy',
    sections: [
      [
        'Prohibited use',
        'Do not use MooNsConfig for unlawful travel services, fraud, harassment, malware, credential abuse, unsolicited messaging, deceptive advertising, or attempts to access another company’s workspace.',
      ],
      [
        'Provider rules',
        'Email, SMS, telephony, advertising, AI, and payment integrations must use authorized credentials and comply with provider rules, consent requirements, and applicable law.',
      ],
    ],
  },
  refunds: {
    title: 'Cancellation and Refund Policy',
    sections: [
      [
        'Cancellation',
        'Self-service subscriptions may be cancelled for the end of the current paid period. Access continues through that period unless suspension is required for risk, abuse, or non-payment.',
      ],
      [
        'Refunds',
        'Fees already paid are generally non-refundable except where required by law, caused by a verified duplicate charge, or expressly agreed in an Enterprise order form.',
      ],
    ],
  },
  dpa: {
    title: 'Data Processing Addendum',
    sections: [
      [
        'Roles',
        'The subscribing travel company is the data fiduciary/controller for traveler and customer records; MooNsConfig acts as its processor for the contracted service.',
      ],
      [
        'Safeguards',
        'MooNsConfig applies tenant isolation, encryption, access control, audit logging, backup, incident response, deletion, and subprocessor governance appropriate to the service.',
      ],
      [
        'Instructions and assistance',
        'Processing follows documented customer instructions. MooNsConfig assists with data-subject requests, security incidents, deletion, and legally required assessments as described in the agreement.',
      ],
    ],
  },
};

export default function LegalDocument() {
  const { document = '' } = useParams();
  const content = documents[document];
  if (!content) return <main className="p-10 text-center">Legal document not found.</main>;
  return (
    <main className="min-h-screen bg-muted/20 px-5 py-12">
      <article className="mx-auto max-w-3xl rounded-xl border bg-card p-8 shadow-sm">
        <Link className="text-sm text-primary hover:underline" to="/pricing">
          ← Back to pricing
        </Link>
        <h1 className="mt-5 text-3xl font-bold">{content.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Launch template · legal review required before production publication · effective 19 July
          2026
        </p>
        <div className="mt-8 space-y-7">
          {content.sections.map(([title, body]) => (
            <section key={title}>
              <h2 className="text-lg font-semibold">{title}</h2>
              <p className="mt-2 leading-7 text-muted-foreground">{body}</p>
            </section>
          ))}
        </div>
        <p className="mt-10 border-t pt-5 text-sm text-muted-foreground">
          Questions or rights requests: privacy@moonsconfig.com
        </p>
      </article>
    </main>
  );
}
