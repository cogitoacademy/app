ALTER TABLE "academy_class" ADD COLUMN "class_number" serial NOT NULL;--> statement-breakpoint
ALTER TABLE "academy_class" ADD CONSTRAINT "academy_class_class_number_unique" UNIQUE("class_number");