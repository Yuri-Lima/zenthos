import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GLOSSARY, GlossaryTermSchema, glossaryGraph } from '@zenthos/domain';
import { z } from 'zod';
import { Public } from '../auth/session.guard.js';
import { jsonSchema } from '../openapi.js';

const GlossaryResponse = z.object({ terms: z.array(GlossaryTermSchema), edges: z.array(z.object({ from: z.string(), to: z.string(), rel: z.string() })) });

/** The knowledge base (ADR 014): the domain's terms and their relations, the same for every reader. Public: it explains the product, it holds no data. */
@ApiTags('glossary')
@Controller('glossary')
export class GlossaryController {
  @Public()
  @Get()
  @ApiOperation({ summary: 'Every term the product uses, with its definition, kind, relations and deciding ADR' })
  @ApiOkResponse({ schema: jsonSchema(GlossaryResponse) })
  list(): z.infer<typeof GlossaryResponse> {
    return { terms: [...GLOSSARY], edges: glossaryGraph().edges };
  }
}
