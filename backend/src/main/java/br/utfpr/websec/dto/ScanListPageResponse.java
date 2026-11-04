package br.utfpr.websec.dto;

import java.util.List;

public record ScanListPageResponse(List<ScanListItem> content, int page, int size,
        long totalElements, long totalPages) {}
