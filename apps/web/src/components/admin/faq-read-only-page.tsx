"use client";

import { useQuery } from "@tanstack/react-query";
import type { FaqAnswerBlock } from "@cogito-app/api/modules/faq/faq.types";
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@cogito-app/ui/components/selia/accordion";
import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Spinner } from "@cogito-app/ui/components/selia/spinner";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { client } from "@/utils/orpc";

function FaqAnswer({ blocks }: { blocks: FaqAnswerBlock[] }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-muted">
      {blocks.map((block) =>
        block.type === "paragraph" ? (
          <p key={`paragraph-${block.text}`}>{block.text}</p>
        ) : block.style === "ordered" ? (
          <ol
            key={`ordered-${block.items.join("|")}`}
            className="list-decimal space-y-1 pl-5"
          >
            {block.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        ) : (
          <ul
            key={`unordered-${block.items.join("|")}`}
            className="list-disc space-y-1 pl-5"
          >
            {block.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

export function FaqReadOnlyPage() {
  const faqQuery = useQuery({
    queryKey: ["publicContent", "faq", "list", "en", "full"],
    queryFn: () =>
      client.publicContent.faq.list({ locale: "en", surface: "full" }),
  });

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl p-4 md:p-6">
      <Stack spacing="lg">
        <div>
          <Heading level={1}>FAQ</Heading>
          <p className="mt-1 text-muted">
            Answers to common questions about Cogito Academy.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Frequently asked questions</CardTitle>
            <CardDescription>
              Open a question to read its answer.
            </CardDescription>
          </CardHeader>
          <CardBody>
            {faqQuery.isPending ? (
              <div className="flex justify-center py-8">
                <Spinner aria-label="Loading FAQs" />
              </div>
            ) : faqQuery.isError ? (
              <p className="text-danger" role="alert">
                FAQs could not be loaded. Refresh the page to try again.
              </p>
            ) : faqQuery.data.length === 0 ? (
              <p className="text-muted">There are no FAQs available yet.</p>
            ) : (
              <Accordion className="w-full">
                {faqQuery.data.map((faq) => (
                  <AccordionItem key={faq.id} value={faq.id}>
                    <AccordionHeader>
                      <AccordionTrigger>{faq.question}</AccordionTrigger>
                    </AccordionHeader>
                    <AccordionPanel>
                      <FaqAnswer blocks={faq.answer} />
                    </AccordionPanel>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </CardBody>
        </Card>
      </Stack>
    </main>
  );
}
