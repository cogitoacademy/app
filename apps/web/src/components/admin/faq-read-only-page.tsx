"use client";

import { useQuery } from "@tanstack/react-query";
import { IconPlus } from "@tabler/icons-react";
import type { FaqAnswerBlock } from "@cogito-app/api/modules/faq/faq.types";
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@cogito-app/ui/components/selia/accordion";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Text } from "@cogito-app/ui/components/selia/text";
import { Spinner } from "@cogito-app/ui/components/selia/spinner";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { client } from "@/utils/orpc";

export function FaqAnswer({ blocks }: { blocks: FaqAnswerBlock[] }) {
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
    <main className="w-full min-w-0 max-w-full">
      <Stack spacing="md">
        <div>
          <Heading level={1} size="md">
            FAQ
          </Heading>
          <Text className="text-muted">
            Answers to common questions about Cogito Academy.
          </Text>
        </div>

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
          <Accordion className="w-full gap-3">
            {faqQuery.data.map((faq) => (
              <AccordionItem
                key={faq.id}
                value={faq.id}
                className="group rounded-3xl border border-transparent last:border-b bg-accent transition-colors data-[open]:border-card-border data-[open]:bg-card motion-reduce:transition-none"
              >
                <AccordionHeader>
                  <AccordionTrigger
                    expandableIndicator={false}
                    className="gap-4 rounded-3xl py-2 pl-5 pr-2 sm:pl-6"
                  >
                    <span className="min-w-0 flex-1 break-words py-2">
                      {faq.question}
                    </span>
                    <span
                      aria-hidden="true"
                      className="flex size-11 shrink-0 items-center justify-center rounded-full bg-card group-data-[open]:bg-accent"
                    >
                      <IconPlus className="size-4 transition-transform group-data-[open]:rotate-45 motion-reduce:transition-none" />
                    </span>
                  </AccordionTrigger>
                </AccordionHeader>
                <AccordionPanel className="transition-[height] duration-250 ease-in-out motion-reduce:transition-none">
                  <div className="px-5 pb-3 sm:px-6">
                    <FaqAnswer blocks={faq.answer} />
                  </div>
                </AccordionPanel>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </Stack>
    </main>
  );
}
