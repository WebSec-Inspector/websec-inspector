package br.utfpr.websec.dto;

/** managerId nulo remove o vínculo; somente administradores podem alterar esse vínculo. */
public record AssignManagerRequest(Long managerId) {}
