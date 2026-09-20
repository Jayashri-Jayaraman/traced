package com.traced.backend.service;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.traced.backend.dto.DesignResponse;
import com.traced.backend.dto.DesignSaveRequest;
import com.traced.backend.dto.DesignSummaryResponse;
import com.traced.backend.entity.Design;
import com.traced.backend.entity.User;
import com.traced.backend.exception.ApiException;
import com.traced.backend.repository.DesignRepository;
import com.traced.backend.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class DesignService {

    private final DesignRepository designRepository;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;

    public DesignService(DesignRepository designRepository, UserRepository userRepository, ObjectMapper objectMapper) {
        this.designRepository = designRepository;
        this.userRepository = userRepository;
        this.objectMapper = objectMapper;
    }

    public List<DesignSummaryResponse> listMine(String ownerEmail) {
        User owner = requireUser(ownerEmail);
        return designRepository.findByOwnerIdOrderByUpdatedAtDesc(owner.getId()).stream()
                .map(this::toSummary)
                .toList();
    }

    public DesignResponse get(String ownerEmail, Long id) {
        Design design = requireOwnedDesign(ownerEmail, id);
        return toResponse(design);
    }

    @Transactional
    public DesignResponse create(String ownerEmail, DesignSaveRequest request) {
        User owner = requireUser(ownerEmail);
        Design design = Design.builder()
                .owner(owner)
                .name(request.name())
                .currentStep(request.currentStep())
                .stepAnswersJson(writeJson(request.stepAnswers()))
                .nodesJson(writeJson(request.nodes()))
                .edgesJson(writeJson(request.edges()))
                .build();
        designRepository.save(design);
        return toResponse(design);
    }

    @Transactional
    public DesignResponse update(String ownerEmail, Long id, DesignSaveRequest request) {
        Design design = requireOwnedDesign(ownerEmail, id);
        design.setName(request.name());
        design.setCurrentStep(request.currentStep());
        design.setStepAnswersJson(writeJson(request.stepAnswers()));
        design.setNodesJson(writeJson(request.nodes()));
        design.setEdgesJson(writeJson(request.edges()));
        designRepository.save(design);
        return toResponse(design);
    }

    @Transactional
    public void delete(String ownerEmail, Long id) {
        Design design = requireOwnedDesign(ownerEmail, id);
        designRepository.delete(design);
    }

    private Design requireOwnedDesign(String ownerEmail, Long id) {
        Design design = designRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Design not found"));
        if (!design.getOwner().getEmail().equals(ownerEmail)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Design not found");
        }
        return design;
    }

    private User requireUser(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Unknown user"));
    }

    private DesignSummaryResponse toSummary(Design design) {
        return new DesignSummaryResponse(
                design.getId(),
                design.getName(),
                design.getCurrentStep(),
                design.getCreatedAt(),
                design.getUpdatedAt()
        );
    }

    private DesignResponse toResponse(Design design) {
        return new DesignResponse(
                design.getId(),
                design.getName(),
                design.getCurrentStep(),
                readJson(design.getStepAnswersJson()),
                readJson(design.getNodesJson()),
                readJson(design.getEdgesJson()),
                design.getCreatedAt(),
                design.getUpdatedAt()
        );
    }

    private String writeJson(JsonNode node) {
        try {
            return objectMapper.writeValueAsString(node);
        } catch (JacksonException e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Invalid JSON payload");
        }
    }

    private JsonNode readJson(String json) {
        try {
            return objectMapper.readTree(json);
        } catch (JacksonException e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Corrupt stored design data");
        }
    }
}
