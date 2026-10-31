package br.utfpr.websec.service;

import br.utfpr.websec.dto.VerificationChallengeResponse;
import br.utfpr.websec.exception.ExistingDomainTokenException;
import br.utfpr.websec.exception.ResourceNotFoundException;
import br.utfpr.websec.model.*;
import br.utfpr.websec.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.Optional;
import java.util.UUID;

@Service
public class VerificationChallengeService {
    private final VerificationChallengeRepository challenges;
    private final UserRepository users;
    public VerificationChallengeService(VerificationChallengeRepository challenges,UserRepository users){
        this.challenges=challenges;this.users=users;
    }
    private User user(String email){return users.findByEmail(email).orElseThrow(()->new ResourceNotFoundException("Usuário não encontrado"));}
    @Transactional
    public VerificationChallengeResponse issue(String email){
        User owner=user(email);
        owner=users.findByIdForDomainCreation(owner.getId()).orElseThrow(()->new ResourceNotFoundException("Usuário não encontrado"));
        Optional<VerificationChallenge> pending=challenges.findByUser_IdAndDomainIsNull(owner.getId());
        if(pending.isPresent())return response(pending.get());
        VerificationChallenge challenge=new VerificationChallenge();
        challenge.setUser(owner);challenge.setToken(VerificationTokens.generate());
        return response(challenges.saveAndFlush(challenge));
    }
    @Transactional(readOnly=true)
    public Optional<VerificationChallengeResponse> current(String email){
        return challenges.findByUser_IdAndDomainIsNull(user(email).getId()).map(this::response);
    }
    @Transactional(readOnly=true)
    public VerificationChallengeResponse get(String email,UUID id){return response(owned(id,user(email).getId()));}

    // Called before URL/DNS processing. This query does not cache an entity;
    // the mutable binding must be re-read only after the owner lock is acquired.
    public void assertSelectable(UUID id,User actor,User owner){
        if(!actor.getId().equals(owner.getId())||!challenges.existsByIdAndUser_Id(id,actor.getId()))
            throw new ResourceNotFoundException("Desafio não encontrado");
    }
    public VerificationChallenge owned(UUID id,Long userId){
        return challenges.findByIdAndUser_Id(id,userId).orElseThrow(()->new ResourceNotFoundException("Desafio não encontrado"));
    }
    public void assertUnbound(VerificationChallenge challenge){
        if(challenge!=null&&challenge.getDomain()!=null)throw new IllegalStateException("Este token já está vinculado a outro domínio.");
    }
    public void bind(VerificationChallenge challenge,Domain domain){
        if(challenge==null)return;
        if(!challenge.getUser().getId().equals(domain.getUser().getId()))throw new ResourceNotFoundException("Desafio não encontrado");
        if(challenge.getDomain()!=null&&!challenge.getDomain().getId().equals(domain.getId()))
            throw new IllegalStateException("Este token já está vinculado a outro domínio.");
        if(!domain.getVerificationToken().equals(challenge.getToken()))throw new ExistingDomainTokenException(domain);
        challenge.setDomain(domain);challenges.save(challenge);
    }
    private VerificationChallengeResponse response(VerificationChallenge c){
        return new VerificationChallengeResponse(c.getId(),c.getToken(),c.getCreatedAt(),
                c.getDomain()==null?null:c.getDomain().getId(),c.getDomain()==null?null:c.getDomain().getHostname());
    }
}
